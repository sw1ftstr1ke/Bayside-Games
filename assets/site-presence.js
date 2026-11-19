import { SupabasePresence } from '../apex-gp/src/supabase-presence.js';

const OWNER_PUBLIC_JWK = {
  kty: 'EC', crv: 'P-256',
  x: 'rK-eNcdmsryuHaoHgI4dQmCwGPBPgH5Hi6_daDDMni4',
  y: 'KWhhVlditgRrSXwHjmSVvK-J3dP8Di_VjA-Bji-xxyo',
  ext: true
};
const OWNER_PROOF_LIFETIME = 3 * 60 * 1000;
const encoder = new TextEncoder();
const $ = id => document.getElementById(id);
let presence = null;
let roster = [];
let status = 'CONNECTING';
let ownerPrivateKey = null;
let ownerVerified = false;

function safeGet(key, fallback = '') {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage may be unavailable */ }
}
function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}
function cleanName(value) {
  return String(value || 'RACER').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18) || 'RACER';
}
function cleanDriverId(value) {
  const id = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return id.length >= 8 ? id : '';
}
function getDriverId() {
  const key = 'bayside-apex-driver-id-v1';
  let id = safeGet(key);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `driver-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    safeSet(key, id);
  }
  return id;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
function toBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromBase64Url(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
function proofMessage(sessionId, expires, nonce) {
  return encoder.encode(`BAYSIDE-GAMES-OWNER-v1|${sessionId}|${expires}|${nonce}`);
}
let publicKeyPromise = null;
function getPublicKey() {
  if (!publicKeyPromise) publicKeyPromise = crypto.subtle.importKey('jwk', OWNER_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return publicKeyPromise;
}
async function authenticateOwner(privateJwk) {
  try {
    if (!globalThis.crypto?.subtle || !privateJwk) return false;
    const publicKey = await getPublicKey();
    const privateKey = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const challenge = encoder.encode('BAYSIDE-GAMES-OWNER-CREDENTIAL-CHECK-v1');
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, challenge);
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, challenge)) return false;
    ownerPrivateKey = privateKey;
    ownerVerified = true;
    return true;
  } catch (error) {
    console.warn('Bayside owner credential could not be verified:', error);
    return false;
  }
}
async function createOwnerProof(sessionId) {
  if (!ownerPrivateKey || !sessionId) return null;
  const expires = Date.now() + OWNER_PROOF_LIFETIME;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ownerPrivateKey, proofMessage(sessionId, expires, nonce));
  return { expires, nonce, signature: toBase64Url(signature) };
}
async function verifyOwnerProof(sessionId, proof) {
  try {
    if (!proof || !Number.isFinite(proof.expires) || proof.expires < Date.now() || proof.expires > Date.now() + OWNER_PROOF_LIFETIME + 15000) return false;
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      await getPublicKey(),
      fromBase64Url(proof.signature),
      proofMessage(sessionId, proof.expires, proof.nonce)
    );
  } catch { return false; }
}
function crownMarkup(className = '') {
  return `<svg class="owner-crown-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 8l4.4 3.3L12 5l4.6 6.3L21 8l-2 10H5L3 8Z"/><path d="M6 15.5h12"/></svg>`;
}
function renderMember(member) {
  const isSelf = member.isSelf === true;
  const isOwner = member.isOwner === true;
  const name = escapeHtml(cleanName(member.name || (isSelf ? 'YOU' : 'RACER')));
  const initials = escapeHtml(cleanName(member.name || 'R').slice(0, 2).toUpperCase());
  let hash = 0;
  for (const char of String(member.peerId || member.sessionId || name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const colors = ['#496b89', '#6b648c', '#4f806f', '#8a664f', '#536b8f', '#8a5870', '#667d4e'];
  const color = colors[hash % colors.length];
  const role = isOwner ? '' : `<span class="site-player-role">PLAYER${isSelf ? ' · YOU' : ''}</span>`;
  return `<article class="site-player ${isSelf ? 'is-self' : ''} ${isOwner ? 'is-owner' : ''}">
    ${role}
    <div class="site-player-nameplate">
      <span class="site-player-avatar-wrap"><span class="site-player-avatar" style="--player-color:${color}">${initials}</span><i class="site-player-status" title="Online"></i></span>
      <span class="site-player-details"><b>${name}${isOwner ? crownMarkup('site-owner-name-crown') : ''}</b><small>${isOwner ? 'BAYSIDE GAMES OWNER' : 'ON THE WEBSITE'}</small></span>
    </div>
  </article>`;
}
function render() {
  const panel = $('site-players-panel');
  if (!panel) return;
  const count = roster.length;
  const connected = status === 'CONNECTED';
  $('site-player-count').textContent = `${count} ONLINE`;
  const navCount = $('site-player-nav-count');
  if (navCount) navCount.textContent = String(count);
  $('site-player-footer-status').textContent = connected ? 'CONNECTED' : status.replace(/_/g, ' ');
  $('site-player-owner-login').textContent = ownerVerified ? 'OWNER VERIFIED' : 'OWNER LOGIN';
  $('site-player-owner-login').classList.toggle('owner-verified', ownerVerified);
  $('site-player-owner-login').disabled = ownerVerified;
  panel.classList.toggle('is-offline', !connected);

  const list = $('site-player-list');
  if (!count) {
    const message = connected
      ? 'You are connected. Other visitors will appear here when they come online.'
      : status === 'NOT_CONFIGURED'
        ? 'The global player service is not configured.'
        : 'Connecting to the global player list…';
    list.innerHTML = `<div class="site-player-empty">${message}</div>`;
    return;
  }
  const sorted = [...roster].sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || String(a.name || '').localeCompare(String(b.name || '')));
  const owners = sorted.filter(member => member.isOwner);
  const players = sorted.filter(member => !member.isOwner);
  list.innerHTML = `${owners.length ? `<div class="site-player-group site-owner-group">${crownMarkup('site-owner-category-crown')}SITE OWNER <b>${owners.length}</b></div>${owners.map(renderMember).join('')}` : ''}${players.length ? `<div class="site-player-group site-drivers-group">ONLINE PLAYERS <b>${players.length}</b></div>${players.map(renderMember).join('')}` : ''}`;
}
function setPanelOpen(open) {
  document.body.classList.toggle('site-players-open', !!open);
  $('site-players-panel')?.classList.toggle('collapsed', !open);
  $('site-players-toggle')?.setAttribute('aria-expanded', String(!!open));
}
function setupPanelControls() {
  const desktop = window.matchMedia('(min-width: 900px)');
  setPanelOpen(desktop.matches);
  $('site-players-toggle')?.addEventListener('click', () => setPanelOpen(!$('site-players-panel').classList.contains('collapsed')));
  $('site-players-close')?.addEventListener('click', () => setPanelOpen(false));
  desktop.addEventListener?.('change', event => setPanelOpen(event.matches));
}
async function setupPresence() {
  const savedCredential = safeJson(safeGet('bayside-games-owner-key'));
  if (savedCredential) ownerVerified = await authenticateOwner(savedCredential);
  const savedName = cleanName(safeGet('bayside-games-player-name', 'RACER'));
  const nameInput = $('site-player-name');
  if (nameInput) nameInput.value = savedName;

  presence = new SupabasePresence({
    getPeerId: () => presence?.sessionId || '',
    getOwnerProof: sessionId => createOwnerProof(sessionId),
    verifyOwnerProof,
    roster: nextRoster => { roster = Array.isArray(nextRoster) ? nextRoster : []; render(); },
    status: nextStatus => { status = nextStatus || 'CONNECTING'; render(); }
  });
  await presence.start({ name: savedName, driverId: getDriverId() });

  const save = () => {
    const name = cleanName(nameInput?.value || 'RACER');
    if (nameInput) nameInput.value = name;
    safeSet('bayside-games-player-name', name);
    presence?.updateProfile({ name, driverId: getDriverId() });
  };
  $('site-player-name-save')?.addEventListener('click', save);
  nameInput?.addEventListener('keydown', event => { if (event.key === 'Enter') save(); });
  $('site-player-owner-login')?.addEventListener('click', async () => {
    if (ownerVerified) return;
    const raw = window.prompt('Paste your private Bayside Games OWNER credential. Keep it private.');
    if (!raw) return;
    const credential = safeJson(raw);
    if (!credential || !await authenticateOwner(credential)) {
      window.alert('That owner credential is not valid for this site.');
      return;
    }
    safeSet('bayside-games-owner-key', JSON.stringify(credential));
    await presence?.refresh();
    render();
  });
  window.addEventListener('storage', event => {
    if (event.key === 'bayside-games-player-name' && event.newValue) {
      const name = cleanName(event.newValue);
      if (nameInput) nameInput.value = name;
      presence?.updateProfile({ name });
    }
  });
}
setupPanelControls();
setupPresence().catch(error => {
  console.error('Bayside site player list failed to start:', error);
  status = 'CONNECTION_ERROR';
  render();
});
