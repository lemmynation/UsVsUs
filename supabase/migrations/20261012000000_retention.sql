-- Phase 6: data retention (design doc §15). Safe to re-run.
-- The periods live in lib/retention.ts (the /privacy page quotes them); the
-- server passes the cutoff timestamps in, so this function holds no policy.

-- Paid payment records outlive their room (accounting/refunds): the link is
-- cleared instead of deleting the payment.
alter table payments alter column room_id drop not null;
alter table payments drop constraint if exists payments_room_id_fkey;
alter table payments
  add constraint payments_room_id_fkey foreign key (room_id) references rooms (id) on delete set null;

create index if not exists rooms_expires_at_all_idx on rooms (expires_at);
create index if not exists events_created_idx on events (created_at);
create index if not exists question_history_last_seen_idx on question_history (last_seen_at);

-- A payment whose room was cleaned up can no longer unlock anything.
create or replace function grant_entitlement(p_payment_id uuid, p_provider_payment_id text, p_now timestamptz) returns text
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
  if v_payment.room_id is null then
    return 'not_found';
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

-- Deletes rooms that expired before p_rooms_before with everything in them
-- (players, games, answers, scores, Wrapped, entitlements cascade; events keep
-- no room link), unpaid payment intents for those rooms, and old question
-- history, events and webhook ids. Returns how many rows of each went.
create or replace function cleanup_expired_data(
  p_rooms_before timestamptz,
  p_history_before timestamptz,
  p_events_before timestamptz,
  p_payment_events_before timestamptz
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

  return jsonb_build_object(
    'rooms', v_rooms,
    'questionHistory', v_history,
    'events', v_events,
    'paymentEvents', v_payment_events
  );
end;
$$;

revoke all on function grant_entitlement, cleanup_expired_data from public, anon, authenticated;
grant execute on function grant_entitlement, cleanup_expired_data to service_role;
