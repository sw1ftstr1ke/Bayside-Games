-- Persistent, shared Apex GP global leaderboard.
-- Run once in Supabase Dashboard -> SQL Editor.
create table if not exists public.apex_gp_leaderboard (
  driver_id text primary key
    check (driver_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  display_name text not null default 'RACER'
    check (char_length(display_name) between 1 and 18),
  best_seconds double precision not null
    check (best_seconds >= 30 and best_seconds <= 240),
  achieved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apex_gp_leaderboard enable row level security;
grant usage on schema public to anon, authenticated;
grant select on public.apex_gp_leaderboard to anon, authenticated;
revoke insert, update, delete on public.apex_gp_leaderboard from anon, authenticated;

drop policy if exists "Apex GP leaderboard is publicly readable" on public.apex_gp_leaderboard;
create policy "Apex GP leaderboard is publicly readable"
  on public.apex_gp_leaderboard
  for select
  to anon, authenticated
  using (true);

create or replace function public.submit_apex_gp_lap(
  p_driver_id text,
  p_display_name text,
  p_seconds double precision
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_update boolean := false;
  safe_name text;
begin
  if p_driver_id is null or p_driver_id !~ '^[A-Za-z0-9_-]{8,80}$' then
    raise exception 'Invalid driver identifier';
  end if;
  if p_seconds is null or p_seconds < 30 or p_seconds > 240 then
    raise exception 'Lap time is outside the accepted range';
  end if;

  safe_name := left(regexp_replace(coalesce(p_display_name, 'RACER'), '[<>[:cntrl:]]', '', 'g'), 18);
  if safe_name = '' then safe_name := 'RACER'; end if;

  insert into public.apex_gp_leaderboard (
    driver_id, display_name, best_seconds, achieved_at, updated_at
  ) values (
    p_driver_id, safe_name, p_seconds, now(), now()
  )
  on conflict (driver_id) do update
    set display_name = excluded.display_name,
        best_seconds = excluded.best_seconds,
        achieved_at = excluded.achieved_at,
        updated_at = now()
    where excluded.best_seconds < public.apex_gp_leaderboard.best_seconds
  returning true into did_update;

  return coalesce(did_update, false);
end;
$$;

revoke all on function public.submit_apex_gp_lap(text, text, double precision) from public;
grant execute on function public.submit_apex_gp_lap(text, text, double precision) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'apex_gp_leaderboard'
  ) then
    alter publication supabase_realtime add table public.apex_gp_leaderboard;
  end if;
end;
$$;
