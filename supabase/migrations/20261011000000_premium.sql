-- Phase 5: premium packs — payments, room entitlements, provider webhook dedupe.
-- Same access model: RLS on with no policies; only the server's secret key
-- (service_role) reads or writes, through the functions below. Card details
-- never touch this database; the provider hosts checkout.

create table payments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  pack_id uuid not null references packs (id),
  provider text not null check (provider in ('paymongo', 'fake')),
  provider_checkout_id text unique,
  checkout_url text,
  provider_payment_id text,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'PHP',
  -- duplicate = paid, but the room already had the pack (needs a refund)
  status text not null default 'pending' check (status in ('pending', 'paid', 'duplicate')),
  created_by_player_id uuid references players (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index payments_room_idx on payments (room_id, created_at desc);

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  pack_id uuid not null references packs (id),
  payment_id uuid not null references payments (id),
  granted_at timestamptz not null default now(),
  unique (room_id, pack_id)
);

-- Provider webhook event ids already handled (providers retry, so duplicates are normal).
create table payment_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table payments enable row level security;
alter table entitlements enable row level security;
alter table payment_events enable row level security;

-- Opens (or reuses) a pending payment for a room's pack. Refuses if the room
-- already has the pack or the game has started. A recent pending payment that
-- already has a checkout page is reused, so double taps don't open two checkouts.
create function create_payment(
  p_room_id uuid,
  p_pack_slug text,
  p_provider text,
  p_amount_minor integer,
  p_currency text,
  p_player_id uuid,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_pack_id uuid;
  v_payment payments;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.status <> 'LOBBY' then
    return jsonb_build_object('error', 'not_in_lobby');
  end if;

  select id into v_pack_id from packs where slug = p_pack_slug and active and not is_free;
  if v_pack_id is null then
    return jsonb_build_object('error', 'pack_not_found');
  end if;

  perform 1 from entitlements where room_id = p_room_id and pack_id = v_pack_id;
  if found then
    return jsonb_build_object('error', 'already_unlocked');
  end if;

  select * into v_payment from payments
   where room_id = p_room_id and pack_id = v_pack_id and status = 'pending'
     and checkout_url is not null and created_at > p_now - interval '30 minutes'
   order by created_at desc limit 1;
  if found then
    return jsonb_build_object('payment', to_jsonb(v_payment), 'reused', true);
  end if;

  insert into payments (room_id, pack_id, provider, amount_minor, currency, created_by_player_id, created_at)
  values (p_room_id, v_pack_id, p_provider, p_amount_minor, p_currency, p_player_id, p_now)
  returning * into v_payment;
  return jsonb_build_object('payment', to_jsonb(v_payment), 'reused', false);
end;
$$;

-- Marks a verified payment paid and unlocks the pack for the room, exactly once.
-- Returns 'granted', 'already' (this payment was handled before), 'duplicate'
-- (paid, but the room already had the pack) or 'not_found'.
create function grant_entitlement(p_payment_id uuid, p_provider_payment_id text, p_now timestamptz) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
begin
  select * into v_payment from payments where id = p_payment_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_payment.status <> 'pending' then
    return 'already';
  end if;

  insert into entitlements (room_id, pack_id, payment_id, granted_at)
  values (v_payment.room_id, v_payment.pack_id, v_payment.id, p_now)
  on conflict (room_id, pack_id) do nothing;

  if found then
    update payments set status = 'paid', paid_at = p_now, provider_payment_id = p_provider_payment_id
     where id = p_payment_id;
    return 'granted';
  end if;
  update payments set status = 'duplicate', paid_at = p_now, provider_payment_id = p_provider_payment_id
   where id = p_payment_id;
  return 'duplicate';
end;
$$;

-- True the first time an event id is seen.
create function record_payment_event(p_provider text, p_event_id text, p_now timestamptz) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into payment_events (provider, event_id, received_at) values (p_provider, p_event_id, p_now)
  on conflict do nothing;
  return found;
end;
$$;

-- start_game gains an optional pack: the entitlement is checked under the same
-- room lock that moves the room into the game, so a locked pack can't be played.
drop function start_game(uuid, integer, jsonb, timestamptz);

create function start_game(
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

revoke all on function create_payment, grant_entitlement, record_payment_event, start_game
  from public, anon, authenticated;
grant execute on function create_payment, grant_entitlement, record_payment_event, start_game to service_role;
