-- Phase 4: the end-of-game Wrapped report, frozen once the game finishes so it
-- reads the same for everyone and survives players leaving afterwards.
-- Same access model as before: RLS on, no policies, server (service_role) only.

create table wrapped_reports (
  game_session_id uuid primary key references game_sessions (id) on delete cascade,
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  created_at timestamptz not null default now()
);

alter table wrapped_reports enable row level security;

-- Saves the report once; a second (racing) save keeps the first. Returns the stored report.
create function save_wrapped(p_session_id uuid, p_report jsonb, p_now timestamptz) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into wrapped_reports (game_session_id, report, created_at)
  values (p_session_id, p_report, p_now)
  on conflict (game_session_id) do nothing;
  return (select report from wrapped_reports where game_session_id = p_session_id);
end;
$$;

revoke all on function save_wrapped from public, anon, authenticated;
grant execute on function save_wrapped to service_role;
