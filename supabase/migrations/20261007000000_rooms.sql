-- Phase 1: rooms, players, packs, events.
-- All access goes through the Next.js server using the service role key.
-- RLS is enabled with no policies, so the public anon key cannot read or
-- write these tables directly.

create extension if not exists pgcrypto;

create table packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  mode_scope text[] not null,
  price_minor integer not null default 0 check (price_minor >= 0),
  currency text not null default 'PHP',
  is_free boolean not null default false,
  active boolean not null default true
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique check (join_code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  mode text not null check (mode in ('couple', 'friends', 'circle')),
  name text check (char_length(name) <= 40),
  host_player_id uuid,
  status text not null default 'LOBBY'
    check (status in ('LOBBY', 'IN_GAME', 'WRAPPED', 'COMPLETED', 'EXPIRED', 'ABANDONED')),
  selected_pack_id uuid references packs (id),
  current_round integer,
  current_question integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index rooms_expires_at_idx on rooms (expires_at) where status in ('LOBBY', 'IN_GAME');

create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  session_token_hash text not null,
  is_host boolean not null default false,
  status text not null default 'active' check (status in ('active', 'kicked')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, session_token_hash)
);

create unique index players_active_nickname_idx
  on players (room_id, lower(nickname)) where status = 'active';

alter table rooms
  add constraint rooms_host_player_fk
  foreign key (host_player_id) references players (id) on delete set null
  deferrable initially deferred;

create table events (
  id bigint generated always as identity primary key,
  anonymous_session_id text,
  room_id uuid references rooms (id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_name_created_idx on events (event_name, created_at);

alter table packs enable row level security;
alter table rooms enable row level security;
alter table players enable row level security;
alter table events enable row level security;

-- Atomic room + host creation. Raises unique_violation (23505) on a join code
-- collision so the caller can retry with a fresh code.
create function create_room(
  p_join_code text,
  p_mode text,
  p_name text,
  p_expires_at timestamptz,
  p_now timestamptz,
  p_nickname text,
  p_session_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_player players;
begin
  insert into rooms (join_code, mode, name, expires_at, created_at)
  values (p_join_code, p_mode, p_name, p_expires_at, p_now)
  returning * into v_room;

  insert into players (room_id, nickname, session_token_hash, is_host, joined_at, last_seen_at)
  values (v_room.id, p_nickname, p_session_token_hash, true, p_now, p_now)
  returning * into v_player;

  update rooms set host_player_id = v_player.id where id = v_room.id
  returning * into v_room;

  return jsonb_build_object('room', to_jsonb(v_room), 'host', to_jsonb(v_player));
end;
$$;

-- Atomic join: locks the room row so concurrent joins can't exceed capacity.
-- Returns {"error": "..."} or {"player": {...}}.
create function join_room(
  p_room_id uuid,
  p_nickname text,
  p_session_token_hash text,
  p_max_players integer,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_count integer;
  v_player players;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.status <> 'LOBBY' or v_room.expires_at <= p_now then
    return jsonb_build_object('error', 'room_not_open');
  end if;

  select count(*) into v_count from players where room_id = p_room_id and status = 'active';
  if v_count >= p_max_players then
    return jsonb_build_object('error', 'room_full');
  end if;

  begin
    insert into players (room_id, nickname, session_token_hash, joined_at, last_seen_at)
    values (p_room_id, p_nickname, p_session_token_hash, p_now, p_now)
    returning * into v_player;
  exception when unique_violation then
    return jsonb_build_object('error', 'nickname_taken');
  end;

  return jsonb_build_object('player', to_jsonb(v_player));
end;
$$;

-- Atomic leave: removes the player and hands host to the earliest remaining
-- player, or marks an open room ABANDONED when nobody is left.
create function leave_room(p_player_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_player players;
  v_successor uuid;
begin
  select room_id into v_room_id from players where id = p_player_id;
  if not found then
    return;
  end if;

  -- Lock the room first, then re-read the player: a concurrent leave may have
  -- just made this player host, and we must see that.
  perform 1 from rooms where id = v_room_id for update;
  select * into v_player from players where id = p_player_id;
  if not found then
    return;
  end if;

  delete from players where id = p_player_id;

  if v_player.is_host then
    select id into v_successor from players
      where room_id = v_player.room_id and status = 'active'
      order by joined_at asc limit 1;

    if v_successor is not null then
      update players set is_host = true where id = v_successor;
      update rooms set host_player_id = v_successor where id = v_player.room_id;
    else
      update rooms
        set host_player_id = null,
            status = case when status in ('LOBBY', 'IN_GAME') then 'ABANDONED' else status end
        where id = v_player.room_id;
    end if;
  end if;
end;
$$;

-- Atomic start: LOBBY -> IN_GAME only if enough active players are still here.
-- Returns 'ok', 'not_in_lobby' or 'not_enough_players'.
create function start_room(p_room_id uuid, p_min_players integer) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_count integer;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.status <> 'LOBBY' then
    return 'not_in_lobby';
  end if;

  select count(*) into v_count from players where room_id = p_room_id and status = 'active';
  if v_count < p_min_players then
    return 'not_enough_players';
  end if;

  update rooms set status = 'IN_GAME' where id = p_room_id;
  return 'ok';
end;
$$;

revoke all on function create_room, join_room, leave_room, start_room from public, anon, authenticated;
grant execute on function create_room, join_room, leave_room, start_room to service_role;
