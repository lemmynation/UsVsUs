-- Engagement phase: one-tap Rematch. Safe to re-run.

-- Sends a finished room back to its lobby for the same group. Only from WRAPPED,
-- under the room lock, so a double tap (or two requests at once) reopens it once.
-- The expiry moves out to at least p_expires_at so the next game gets a full day.
create or replace function reopen_room(p_room_id uuid, p_expires_at timestamptz) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.status <> 'WRAPPED' then
    return 'not_wrapped';
  end if;

  update rooms
     set status = 'LOBBY',
         selected_pack_id = null,
         expires_at = greatest(expires_at, p_expires_at)
   where id = p_room_id;
  return 'reopened';
end;
$$;

revoke all on function reopen_room from public, anon, authenticated;
grant execute on function reopen_room to service_role;
