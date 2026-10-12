-- UsVsUs 4.2 Sprint 1: Chain Reactions (Mutation Machine). Additive and re-runnable.
-- Same access model: RLS on, no policies; only the server's secret key, through
-- the security-definer functions below. Design: docs/usvsus-4/06-data-model.md.

-- Every existing room stays a Quick Party room.
alter table rooms add column if not exists experience text not null default 'quick_party';
alter table rooms drop constraint if exists rooms_experience_check;
alter table rooms add constraint rooms_experience_check check (experience in ('quick_party', 'chain_reactions'));

create table if not exists chaos_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  game_id text not null,
  -- The frozen plan (card ids, assignments, choices, seed). No player content.
  plan jsonb not null,
  phase text not null check (phase in ('STEP_OPEN', 'REVEAL', 'RECAP')),
  step integer not null default 1,
  reveal_chain integer,
  state_version integer not null default 1,
  phase_started_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists chaos_matches_room_idx on chaos_matches (room_id, started_at desc);
alter table chaos_matches enable row level security;

create table if not exists chaos_contributions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references chaos_matches (id) on delete cascade,
  step integer not null,
  chain integer not null,
  player_id uuid not null references players (id) on delete cascade,
  kind text not null check (kind in ('artifact', 'answer')),
  payload jsonb not null,
  payload_bytes integer not null check (payload_bytes between 1 and 65536),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 64),
  version integer not null default 1,
  submitted_at timestamptz not null default now(),
  unique (match_id, step, chain, player_id)
);
alter table chaos_contributions enable row level security;

create table if not exists chaos_scores (
  match_id uuid not null references chaos_matches (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  step integer not null,
  chain integer not null,
  reason text not null,
  points integer not null check (points >= 0),
  primary key (match_id, player_id, step, chain, reason)
);
create index if not exists chaos_scores_match_idx on chaos_scores (match_id);
alter table chaos_scores enable row level security;

-- create_room gains an optional experience. The old 7-argument version is dropped so
-- calls without p_experience (today's app) resolve to this one and stay Quick Party.
drop function if exists create_room(text, text, text, timestamptz, timestamptz, text, text);
create or replace function create_room(
  p_join_code text,
  p_mode text,
  p_name text,
  p_expires_at timestamptz,
  p_now timestamptz,
  p_nickname text,
  p_session_token_hash text,
  p_experience text default 'quick_party'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_player players;
begin
  insert into rooms (join_code, mode, name, expires_at, created_at, experience)
  values (p_join_code, p_mode, p_name, p_expires_at, p_now, coalesce(p_experience, 'quick_party'))
  returning * into v_room;

  insert into players (room_id, nickname, session_token_hash, is_host, joined_at, last_seen_at)
  values (v_room.id, p_nickname, p_session_token_hash, true, p_now, p_now)
  returning * into v_player;

  update rooms set host_player_id = v_player.id where id = v_room.id
  returning * into v_room;

  return jsonb_build_object('room', to_jsonb(v_room), 'host', to_jsonb(v_player));
end;
$$;

-- LOBBY → IN_GAME and the match row, under the room lock (like start_game).
create or replace function start_chain_match(p_room_id uuid, p_min_players integer, p_game_id text, p_plan jsonb, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_count integer;
  v_match chaos_matches;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.status <> 'LOBBY' then
    return jsonb_build_object('error', 'not_in_lobby');
  end if;
  if v_room.experience <> 'chain_reactions' then
    return jsonb_build_object('error', 'wrong_experience');
  end if;
  select count(*) into v_count from players where room_id = p_room_id and status = 'active';
  if v_count < p_min_players then
    return jsonb_build_object('error', 'not_enough_players');
  end if;

  update rooms set status = 'IN_GAME' where id = p_room_id;
  insert into chaos_matches (room_id, game_id, plan, phase, step, phase_started_at, started_at)
  values (p_room_id, p_game_id, p_plan, 'STEP_OPEN', 1, p_now, p_now)
  returning * into v_match;
  return jsonb_build_object('match', to_jsonb(v_match));
end;
$$;

-- Stores (or replaces, before the step closes) one contribution. Holds a share lock on
-- the match so a concurrent advance waits for it: nothing lands after a step closes.
-- 'ok' | 'duplicate' (same idempotency key: a retry) | 'not_open' | 'not_assigned'.
create or replace function submit_contribution(
  p_match_id uuid,
  p_step integer,
  p_chain integer,
  p_player_id uuid,
  p_kind text,
  p_payload jsonb,
  p_bytes integer,
  p_key text,
  p_now timestamptz
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match chaos_matches;
  v_existing chaos_contributions;
begin
  select * into v_match from chaos_matches where id = p_match_id for share;
  if not found or v_match.phase <> 'STEP_OPEN' or v_match.step <> p_step then
    return 'not_open';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_match.plan -> 'assignments') a
     where (a ->> 'step')::integer = p_step
       and (a ->> 'chain')::integer = p_chain
       and a ->> 'playerId' = p_player_id::text
  ) then
    return 'not_assigned';
  end if;

  select * into v_existing from chaos_contributions
   where match_id = p_match_id and step = p_step and chain = p_chain and player_id = p_player_id;
  if found and v_existing.idempotency_key = p_key then
    return 'duplicate';
  end if;

  insert into chaos_contributions (match_id, step, chain, player_id, kind, payload, payload_bytes, idempotency_key, submitted_at)
  values (p_match_id, p_step, p_chain, p_player_id, p_kind, p_payload, p_bytes, p_key, p_now)
  on conflict (match_id, step, chain, player_id) do update set
    kind = excluded.kind,
    payload = excluded.payload,
    payload_bytes = excluded.payload_bytes,
    idempotency_key = excluded.idempotency_key,
    version = chaos_contributions.version + 1,
    submitted_at = excluded.submitted_at;
  return 'ok';
end;
$$;

-- Compare-and-swap move. Finishing (RECAP) also moves the room to WRAPPED.
create or replace function advance_chain_match(
  p_match_id uuid,
  p_expected_version integer,
  p_phase text,
  p_step integer,
  p_reveal_chain integer,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match chaos_matches;
begin
  update chaos_matches
     set phase = p_phase,
         step = p_step,
         reveal_chain = p_reveal_chain,
         state_version = state_version + 1,
         phase_started_at = p_now,
         ended_at = case when p_phase = 'RECAP' then p_now else ended_at end
   where id = p_match_id and state_version = p_expected_version
  returning * into v_match;
  if not found then
    return null;
  end if;
  if p_phase = 'RECAP' then
    update rooms set status = 'WRAPPED' where id = v_match.room_id and status = 'IN_GAME';
  end if;
  return to_jsonb(v_match);
end;
$$;

-- Locks in a step's points. Idempotent: entries already recorded are kept as they are.
create or replace function record_chain_scores(p_match_id uuid, p_entries jsonb) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into chaos_scores (match_id, player_id, step, chain, reason, points)
  select p_match_id, (e ->> 'playerId')::uuid, (e ->> 'step')::integer, (e ->> 'chain')::integer, e ->> 'reason', (e ->> 'points')::integer
    from jsonb_array_elements(p_entries) e
   where exists (select 1 from players p where p.id = (e ->> 'playerId')::uuid)
  on conflict do nothing;
end;
$$;

revoke all on function create_room, start_chain_match, submit_contribution, advance_chain_match, record_chain_scores
  from public, anon, authenticated;
grant execute on function create_room, start_chain_match, submit_contribution, advance_chain_match, record_chain_scores
  to service_role;
