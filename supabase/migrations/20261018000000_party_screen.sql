-- UsVsUs 4.2 Sprint 2: Party Screen (a TV or laptop as a spectator for Mutation Machine).
-- Additive and re-runnable. Same access model: RLS on, no policies; only the server's
-- secret key. Design: docs/usvsus-4/06-data-model.md and 07-projections-and-party-screen.md.

create table if not exists party_displays (
  id uuid primary key default gen_random_uuid(),
  -- Null until a host approves the pairing code.
  room_id uuid references rooms (id) on delete cascade,
  -- sha256 of the 6-character code the TV shows. Only ever looked up while pending.
  pairing_code_hash text not null,
  -- sha256 of the TV's httpOnly cookie (like players.session_token_hash).
  token_hash text not null unique,
  status text not null check (status in ('pending', 'approved', 'revoked', 'expired')),
  approved_by_player_id uuid references players (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Pending: 5 minutes to pair. Approved: the room's expiry when it was paired (the app
  -- keeps an approved TV for as long as its room is live, rematches included).
  expires_at timestamptz not null,
  last_seen_at timestamptz
);
-- Two TVs showing the same code at once would make "type the code" ambiguous.
create unique index if not exists party_displays_pending_code_idx
  on party_displays (pairing_code_hash) where status = 'pending';
create index if not exists party_displays_room_idx on party_displays (room_id) where room_id is not null;
alter table party_displays enable row level security;

-- The host's phone approves a code: single use, not expired, at most p_max TVs per room,
-- only while the room is live. The room row lock serializes approvals for one room.
create or replace function approve_party_display(
  p_room_id uuid,
  p_code_hash text,
  p_player_id uuid,
  p_max integer,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_display party_displays;
  v_count integer;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.status not in ('LOBBY', 'IN_GAME', 'WRAPPED') or v_room.expires_at <= p_now then
    return jsonb_build_object('error', 'room_closed');
  end if;

  select * into v_display from party_displays
   where pairing_code_hash = p_code_hash and status = 'pending' and expires_at > p_now
   limit 1
   for update;
  if not found then
    return jsonb_build_object('error', 'invalid_code');
  end if;

  select count(*) into v_count from party_displays where room_id = p_room_id and status = 'approved';
  if v_count >= p_max then
    return jsonb_build_object('error', 'too_many_displays');
  end if;

  update party_displays
     set status = 'approved', room_id = p_room_id, approved_by_player_id = p_player_id,
         expires_at = v_room.expires_at, last_seen_at = null
   where id = v_display.id
  returning * into v_display;
  return jsonb_build_object('display', to_jsonb(v_display));
end;
$$;

-- Retention: as in migration 7, plus pairing codes nobody used (and revoked TVs) after a day.
-- Approved TVs go with their room.
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

  delete from party_displays where status <> 'approved' and created_at < now() - interval '1 day';

  return jsonb_build_object(
    'rooms', v_rooms,
    'questionHistory', v_history,
    'events', v_events,
    'paymentEvents', v_payment_events,
    'feedback', v_feedback
  );
end;
$$;

revoke all on function approve_party_display, cleanup_expired_data from public, anon, authenticated;
grant execute on function approve_party_display, cleanup_expired_data to service_role;
