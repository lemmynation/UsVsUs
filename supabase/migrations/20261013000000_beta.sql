-- Phase 7: beta — player feedback, rate limits shared across server instances,
-- and cleanup for both. Safe to re-run. Same access model: RLS on, no policies;
-- only the server's secret key (service_role) reads or writes.

-- One rating per player per game (updated if they add a comment). Links are
-- cleared, not deleted, when the room is cleaned up; the feedback itself is
-- removed after the events retention period.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms (id) on delete set null,
  game_session_id uuid references game_sessions (id) on delete set null,
  player_id uuid references players (id) on delete set null,
  mode text not null check (mode in ('couple', 'friends', 'circle')),
  rating smallint not null check (rating between 1 and 4),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_session_id, player_id)
);
create index if not exists feedback_created_idx on feedback (created_at);
alter table feedback enable row level security;

-- Fixed-window counters keyed by a hash of bucket + client address (never the raw IP).
create table if not exists rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
alter table rate_limits enable row level security;

-- Counts one hit; true while the caller is within `p_max` hits per window.
create or replace function rate_limit_hit(p_key text, p_max integer, p_window_ms integer, p_now timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into rate_limits as r (key, count, reset_at)
  values (p_key, 1, p_now + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update set
    count = case when r.reset_at <= p_now then 1 else r.count + 1 end,
    reset_at = case when r.reset_at <= p_now then p_now + make_interval(secs => p_window_ms / 1000.0) else r.reset_at end
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

-- Retention cleanup, now also covering feedback and spent rate-limit windows.
drop function if exists cleanup_expired_data(timestamptz, timestamptz, timestamptz, timestamptz);
create or replace function cleanup_expired_data(
  p_rooms_before timestamptz,
  p_history_before timestamptz,
  p_events_before timestamptz,
  p_payment_events_before timestamptz,
  p_feedback_before timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rooms integer;
  v_history integer;
  v_events integer;
  v_payment_events integer;
  v_feedback integer;
begin
  delete from payments
   where status = 'pending'
     and room_id in (select id from rooms where expires_at < p_rooms_before);

  delete from rooms where expires_at < p_rooms_before;
  get diagnostics v_rooms = row_count;

  delete from question_history where last_seen_at < p_history_before;
  get diagnostics v_history = row_count;

  delete from events where created_at < p_events_before;
  get diagnostics v_events = row_count;

  delete from payment_events where received_at < p_payment_events_before;
  get diagnostics v_payment_events = row_count;

  delete from feedback where created_at < p_feedback_before;
  get diagnostics v_feedback = row_count;

  delete from rate_limits where reset_at < now();

  return jsonb_build_object(
    'rooms', v_rooms,
    'questionHistory', v_history,
    'events', v_events,
    'paymentEvents', v_payment_events,
    'feedback', v_feedback
  );
end;
$$;

revoke all on function rate_limit_hit, cleanup_expired_data from public, anon, authenticated;
grant execute on function rate_limit_hit, cleanup_expired_data to service_role;
