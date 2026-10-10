-- Packs follow your phone: a paid pack belongs to the buyer's browser session as
-- well as the room it was bought in, so it unlocks in every room they host.
-- Safe to re-run. Same access model: RLS on, no policies, server key only.

-- Keyed by the same SHA-256 session hash players use; no personal data.
create table if not exists owned_packs (
  session_token_hash text not null,
  pack_id uuid not null references packs (id),
  -- The payment that bought it (kept, like every paid payment record).
  payment_id uuid not null references payments (id),
  granted_at timestamptz not null default now(),
  primary key (session_token_hash, pack_id)
);
alter table owned_packs enable row level security;

-- Same as before, plus: the buyer's session now owns the pack. A "duplicate"
-- payment (the room already had it) still counts as owning it.
create or replace function grant_entitlement(p_payment_id uuid, p_provider_payment_id text, p_now timestamptz) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
  v_buyer_hash text;
  v_result text;
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
    v_result := 'granted';
  else
    update payments set status = 'duplicate', paid_at = p_now, provider_payment_id = p_provider_payment_id
     where id = p_payment_id;
    v_result := 'duplicate';
  end if;

  select session_token_hash into v_buyer_hash from players where id = v_payment.created_by_player_id;
  if v_buyer_hash is not null then
    insert into owned_packs (session_token_hash, pack_id, payment_id, granted_at)
    values (v_buyer_hash, v_payment.pack_id, v_payment.id, p_now)
    on conflict (session_token_hash, pack_id) do nothing;
  end if;
  return v_result;
end;
$$;

-- Unlocks, in this room, every pack the given session owns that is sold for the
-- room's mode. Returns how many packs were newly unlocked. Idempotent.
create or replace function claim_owned_packs(p_room_id uuid, p_session_token_hash text, p_now timestamptz) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into entitlements (room_id, pack_id, payment_id, granted_at)
  select r.id, o.pack_id, o.payment_id, p_now
    from rooms r
    join owned_packs o on o.session_token_hash = p_session_token_hash
    join packs p on p.id = o.pack_id and p.active and r.mode = any (p.mode_scope)
   where r.id = p_room_id
  on conflict (room_id, pack_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function grant_entitlement, claim_owned_packs from public, anon, authenticated;
grant execute on function grant_entitlement, claim_owned_packs to service_role;
