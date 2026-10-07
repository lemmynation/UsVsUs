-- Phase 2: server-authoritative game flow, question bank, repeat avoidance.
-- Same access model as Phase 1: RLS on with no policies; only the server's
-- secret key (service_role) reads or writes, mostly through the functions below.

create table questions (
  id text primary key check (id ~ '^[a-z0-9-]{3,64}$'),
  game_type text not null check (game_type in ('mind_reader', 'most_likely', 'this_or_that')),
  modes text[] not null check (modes <@ array['couple', 'friends', 'circle'] and cardinality(modes) > 0),
  category text not null,
  intensity text not null default 'safe' check (intensity in ('safe', 'playful', 'bold')),
  prompt text not null check (char_length(prompt) between 3 and 120),
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  pack_id uuid references packs (id),
  locale text not null default 'en-PH',
  sort_weight integer not null default 0,
  active boolean not null default true
);

create index questions_active_type_idx on questions (game_type) where active;

create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  pack_id uuid references packs (id),
  status text not null default 'active' check (status in ('active', 'finished')),
  phase text not null default 'ROUND_INTRO'
    check (phase in ('ROUND_INTRO', 'QUESTION_OPEN', 'REVEAL', 'SCOREBOARD', 'FINISHED')),
  round_index integer not null default 0,
  question_index integer not null default 0,
  state_version integer not null default 1,
  phase_started_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index game_sessions_room_idx on game_sessions (room_id, started_at desc);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references game_sessions (id) on delete cascade,
  round_index integer not null,
  game_type text not null,
  question_ids text[] not null,
  unique (game_session_id, round_index)
);

create table responses (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references game_sessions (id) on delete cascade,
  round_id uuid not null references rounds (id) on delete cascade,
  question_id text not null references questions (id),
  player_id uuid not null references players (id) on delete cascade,
  answer jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (round_id, question_id, player_id)
);

-- Which questions each anonymous browser session has seen, to avoid repeats.
-- Keyed by the same SHA-256 hash stored on players; no personal data.
create table question_history (
  session_token_hash text not null,
  question_id text not null references questions (id) on delete cascade,
  seen_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  primary key (session_token_hash, question_id)
);

alter table questions enable row level security;
alter table game_sessions enable row level security;
alter table rounds enable row level security;
alter table responses enable row level security;
alter table question_history enable row level security;

-- Replaced by start_game, which also creates the session and its rounds.
drop function start_room(uuid, integer);

-- LOBBY -> IN_GAME plus session and rounds, in one transaction under the room lock.
-- p_rounds: [{"gameType": "...", "questionIds": ["..."]}, ...]
create function start_game(
  p_room_id uuid,
  p_min_players integer,
  p_rounds jsonb,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_count integer;
  v_session game_sessions;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.status <> 'LOBBY' then
    return jsonb_build_object('error', 'not_in_lobby');
  end if;

  select count(*) into v_count from players where room_id = p_room_id and status = 'active';
  if v_count < p_min_players then
    return jsonb_build_object('error', 'not_enough_players');
  end if;

  update rooms set status = 'IN_GAME' where id = p_room_id;

  insert into game_sessions (room_id, phase_started_at, started_at)
  values (p_room_id, p_now, p_now)
  returning * into v_session;

  insert into rounds (game_session_id, round_index, game_type, question_ids)
  select v_session.id, (r.ordinality - 1)::integer, r.value ->> 'gameType',
         array(select jsonb_array_elements_text(r.value -> 'questionIds'))
  from jsonb_array_elements(p_rounds) with ordinality as r;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'rounds', (select jsonb_agg(to_jsonb(x) order by x.round_index) from rounds x where x.game_session_id = v_session.id)
  );
end;
$$;

-- Records an answer only while that exact question is open. FOR SHARE blocks a
-- concurrent advance until this insert commits, so nothing lands after a reveal.
create function submit_response(
  p_session_id uuid,
  p_round_id uuid,
  p_round_index integer,
  p_question_index integer,
  p_question_id text,
  p_player_id uuid,
  p_answer jsonb,
  p_now timestamptz
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session game_sessions;
  v_round rounds;
begin
  select * into v_session from game_sessions where id = p_session_id for share;
  select * into v_round from rounds where id = p_round_id;
  if v_session.id is null or v_round.id is null
     or v_round.game_session_id <> v_session.id
     or v_session.phase <> 'QUESTION_OPEN'
     or v_session.round_index <> p_round_index
     or v_session.question_index <> p_question_index
     or v_round.question_ids[p_question_index + 1] is distinct from p_question_id then
    return 'not_open';
  end if;

  insert into responses (game_session_id, round_id, question_id, player_id, answer, submitted_at)
  values (p_session_id, p_round_id, p_question_id, p_player_id, p_answer, p_now)
  on conflict (round_id, question_id, player_id) do nothing;

  return case when found then 'ok' else 'duplicate' end;
end;
$$;

-- Compare-and-swap transition. Returns {"error": "stale"} if someone else moved first.
create function advance_game(
  p_session_id uuid,
  p_expected_version integer,
  p_phase text,
  p_round_index integer,
  p_question_index integer,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session game_sessions;
begin
  update game_sessions
     set phase = p_phase,
         round_index = p_round_index,
         question_index = p_question_index,
         state_version = state_version + 1,
         phase_started_at = p_now,
         status = case when p_phase = 'FINISHED' then 'finished' else status end,
         ended_at = case when p_phase = 'FINISHED' then p_now else ended_at end
   where id = p_session_id and state_version = p_expected_version
  returning * into v_session;

  if not found then
    return jsonb_build_object('error', 'stale');
  end if;

  if p_phase = 'FINISHED' then
    update rooms set status = 'WRAPPED' where id = v_session.room_id and status = 'IN_GAME';
  end if;

  return jsonb_build_object('session', to_jsonb(v_session));
end;
$$;

-- Hands host to another active player, only if p_from is still the host.
create function transfer_host(p_room_id uuid, p_from uuid, p_to uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from rooms where id = p_room_id and host_player_id = p_from for update;
  if not found then
    return false;
  end if;
  perform 1 from players where id = p_to and room_id = p_room_id and status = 'active';
  if not found then
    return false;
  end if;

  update players set is_host = false where id = p_from;
  update players set is_host = true where id = p_to;
  update rooms set host_player_id = p_to where id = p_room_id;
  return true;
end;
$$;

create function record_question_seen(p_hashes text[], p_question_id text, p_now timestamptz) returns void
language sql
security definer
set search_path = public
as $$
  insert into question_history (session_token_hash, question_id, seen_count, last_seen_at)
  select h, p_question_id, 1, p_now from unnest(p_hashes) as h
  on conflict (session_token_hash, question_id)
  do update set seen_count = question_history.seen_count + 1, last_seen_at = excluded.last_seen_at;
$$;

create function question_history_for(p_hashes text[])
returns table (question_id text, seen_count bigint, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select question_id, sum(seen_count), max(last_seen_at)
  from question_history
  where session_token_hash = any (p_hashes)
  group by question_id;
$$;

revoke all on function start_game, submit_response, advance_game, transfer_host, record_question_seen,
  question_history_for from public, anon, authenticated;
grant execute on function start_game, submit_response, advance_game, transfer_host, record_question_seen,
  question_history_for to service_role;
