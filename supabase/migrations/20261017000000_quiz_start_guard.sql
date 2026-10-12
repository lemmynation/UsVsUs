-- UsVsUs 4.2: a quiz can only start in a Quick Party room. The app checks this too, but
-- it only reads rooms.experience while Chain Reactions is on; this makes the database
-- refuse it whatever the flag says. Needs migration 10 (rooms.experience). Re-runnable.

create or replace function start_game(
  p_room_id uuid,
  p_min_players integer,
  p_rounds jsonb,
  p_now timestamptz,
  p_pack_slug text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_count integer;
  v_pack_id uuid;
  v_session game_sessions;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.status <> 'LOBBY' then
    return jsonb_build_object('error', 'not_in_lobby');
  end if;
  if v_room.experience <> 'quick_party' then
    return jsonb_build_object('error', 'wrong_experience');
  end if;

  select count(*) into v_count from players where room_id = p_room_id and status = 'active';
  if v_count < p_min_players then
    return jsonb_build_object('error', 'not_enough_players');
  end if;

  if p_pack_slug is not null then
    select e.pack_id into v_pack_id from entitlements e join packs p on p.id = e.pack_id
     where e.room_id = p_room_id and p.slug = p_pack_slug;
    if v_pack_id is null then
      return jsonb_build_object('error', 'pack_locked');
    end if;
  end if;

  update rooms set status = 'IN_GAME', selected_pack_id = v_pack_id where id = p_room_id;

  insert into game_sessions (room_id, pack_id, phase_started_at, started_at)
  values (p_room_id, v_pack_id, p_now, p_now)
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


revoke all on function start_game from public, anon, authenticated;
grant execute on function start_game to service_role;
