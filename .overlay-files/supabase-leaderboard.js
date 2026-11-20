import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isSupabaseConfigured } from './supabase-config.js';

const TABLE = 'apex_gp_leaderboard';
const CHANNEL = 'apex-gp-global-leaderboard-v1';
const MAX_ENTRIES = 40;

function cleanName(value) {
  return String(value || 'RACER').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18) || 'RACER';
}
function cleanDriverId(value) {
  const id = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return id.length >= 8 ? id : '';
}
function cleanSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 30 && seconds <= 240 ? seconds : null;
}
function fromRow(row) {
  const seconds = cleanSeconds(row?.best_seconds);
  const driverId = cleanDriverId(row?.driver_id);
  if (!seconds || !driverId) return null;
  const at = Date.parse(row.achieved_at || '');
  return {
    driverId,
    name: cleanName(row.display_name),
    seconds,
    at: Number.isFinite(at) ? at : Date.now()
  };
}

export class SupabaseLeaderboard {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.client = null;
    this.channel = null;
    this.profile = { name: 'RACER', driverId: '' };
    this.connected = false;
    this.closing = false;
    this.connecting = false;
    this.refreshing = false;
    this.refreshAgain = false;
    this.retryTimer = null;
    this.retryCount = 0;
    this.entries = [];
    this.lastRefreshAt = 0;
  }

  emit(type, value) { this.callbacks[type]?.(value); }

  async start(profile = {}) {
    this.profile = {
      name: cleanName(profile.name),
      driverId: cleanDriverId(profile.driverId)
    };
    if (!isSupabaseConfigured()) {
      this.emit('status', 'NOT_CONFIGURED');
      return false;
    }
    await this.connect();
    return true;
  }

  async connect() {
    if (this.closing || this.connecting || !isSupabaseConfigured()) return;
    this.connecting = true;
    this.emit('status', this.retryCount ? 'RECONNECTING' : 'CONNECTING');
    try {
      if (!this.client) {
        this.client = createClient(SUPABASE_URL.trim(), SUPABASE_PUBLISHABLE_KEY.trim(), {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          realtime: { params: { eventsPerSecond: 10 } }
        });
      }
      const channel = this.client.channel(CHANNEL, {
        config: { broadcast: { self: false } }
      });
      this.channel = channel;
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: TABLE
      }, () => this.refresh());
      channel.subscribe(async status => {
        if (this.closing || this.channel !== channel) return;
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          this.retryCount = 0;
          this.emit('status', 'CONNECTED');
          await this.refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.connected = false;
          this.emit('status', 'RECONNECTING');
          this.scheduleReconnect(channel);
        }
      });
    } catch (error) {
      console.error('Supabase leaderboard connection failed:', error);
      this.connected = false;
      this.emit('status', 'CONNECTION_ERROR');
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  async refresh() {
    if (!this.client || this.closing) return;
    if (this.refreshing) {
      this.refreshAgain = true;
      return;
    }
    this.refreshing = true;
    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select('driver_id, display_name, best_seconds, achieved_at')
        .order('best_seconds', { ascending: true })
        .order('achieved_at', { ascending: true })
        .limit(MAX_ENTRIES);
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          this.emit('status', 'SETUP_REQUIRED');
        } else {
          console.error('Supabase leaderboard could not be loaded:', error);
          this.emit('status', 'DATABASE_ERROR');
        }
        return;
      }
      this.entries = (Array.isArray(data) ? data : []).map(fromRow).filter(Boolean);
      this.lastRefreshAt = Date.now();
      this.emit('leaderboard', this.entries.slice());
      if (this.connected) this.emit('status', 'CONNECTED');
    } finally {
      this.refreshing = false;
      if (this.refreshAgain && !this.closing) {
        this.refreshAgain = false;
        queueMicrotask(() => this.refresh());
      }
    }
  }

  async recordLap(seconds) {
    const cleanSecondsValue = cleanSeconds(seconds);
    if (!cleanSecondsValue || !this.profile.driverId || !this.client || this.closing) return false;
    try {
      const { data, error } = await this.client.rpc('submit_apex_gp_lap', {
        p_driver_id: this.profile.driverId,
        p_display_name: this.profile.name,
        p_seconds: cleanSecondsValue
      });
      if (error) throw error;
      await this.refresh();
      return data === true;
    } catch (error) {
      console.error('Global lap submission failed:', error);
      this.emit('status', 'WRITE_ERROR');
      return false;
    }
  }

  updateProfile(profile = {}) {
    this.profile = {
      ...this.profile,
      ...profile,
      name: cleanName(profile.name || this.profile.name),
      driverId: cleanDriverId(profile.driverId || this.profile.driverId)
    };
  }

  scheduleReconnect(failedChannel = this.channel) {
    if (this.closing || this.retryTimer) return;
    this.retryCount = Math.min(this.retryCount + 1, 6);
    const delay = Math.min(30000, 1500 * (2 ** (this.retryCount - 1)));
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (this.closing) return;
      if (failedChannel && this.channel === failedChannel) {
        this.channel = null;
        try { await this.client?.removeChannel(failedChannel); } catch { /* best-effort cleanup */ }
      }
      await this.connect();
    }, delay);
  }

  async close() {
    this.closing = true;
    this.connected = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const channel = this.channel;
    this.channel = null;
    if (channel) {
      try { await this.client?.removeChannel(channel); } catch { /* socket may already be closed */ }
    }
  }
}
