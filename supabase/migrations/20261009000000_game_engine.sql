-- Phase 3: Mind Reader and Who's More Likely, scoring.

alter table questions add column award text check (award is null or char_length(award) between 1 and 40);

-- Mind Reader: who each question is about, parallel to question_ids.
alter table rounds add column subject_player_ids uuid[];

-- Points (or a Circle badge in metadata.award) locked in at each reveal.
-- One row per player per question, so a retried reveal can never double-count.
create table scores (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references game_sessions (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  round_index integer not null,
  question_index integer not null,
  points integer not null default 0 check (points >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (game_session_id, player_id, round_index, question_index)
);

create index scores_session_idx on scores (game_session_id);

alter table scores enable row level security;

-- Same signature as Phase 2; now also stores Mind Reader subjects per round.
create or replace function start_game(
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

  insert into rounds (game_session_id, round_index, game_type, question_ids, subject_player_ids)
  select v_session.id, (r.ordinality - 1)::integer, r.value ->> 'gameType',
         array(select jsonb_array_elements_text(r.value -> 'questionIds')),
         array(select nullif(x, 'null')::uuid
               from jsonb_array_elements_text(coalesce(r.value -> 'subjectPlayerIds', '[]'::jsonb)) as x)
  from jsonb_array_elements(p_rounds) with ordinality as r;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'rounds', (select jsonb_agg(to_jsonb(x) order by x.round_index) from rounds x where x.game_session_id = v_session.id)
  );
end;
$$;

-- Locks in points (or a Circle badge in metadata.award) for a revealed question.
-- Idempotent: a retry or a second caller can never double-count. Entries for
-- players who have just left are skipped instead of failing the whole batch.
-- p_scores: [{"playerId": "...", "roundIndex": 0, "questionIndex": 0, "points": 100, "award": null}, ...]
create function record_scores(p_session_id uuid, p_scores jsonb) returns void
language sql
security definer
set search_path = public
as $$
  insert into scores (game_session_id, player_id, round_index, question_index, points, metadata)
  select p_session_id,
         (s ->> 'playerId')::uuid,
         (s ->> 'roundIndex')::integer,
         (s ->> 'questionIndex')::integer,
         (s ->> 'points')::integer,
         case when s ->> 'award' is null then '{}'::jsonb else jsonb_build_object('award', s ->> 'award') end
  from jsonb_array_elements(p_scores) as s
  where exists (select 1 from players p where p.id = (s ->> 'playerId')::uuid)
  on conflict (game_session_id, player_id, round_index, question_index) do nothing;
$$;

revoke all on function start_game, record_scores from public, anon, authenticated;
grant execute on function start_game, record_scores to service_role;
