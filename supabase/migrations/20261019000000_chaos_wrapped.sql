-- UsVsUs 4.2 Sprint 3: Group Wrapped for Mutation Machine, and feedback after a match.
-- Additive and re-runnable. Same access model: RLS on, no policies; only the server's
-- secret key. Design: docs/usvsus-4/06-data-model.md.

-- The match's frozen Wrapped report (nicknames, points, titles and what the reveals
-- already showed; never drawings or who answered what). Goes with the match.
alter table chaos_matches add column if not exists wrapped jsonb
  check (wrapped is null or jsonb_typeof(wrapped) = 'object');

-- Saves the report once; a second (racing) save keeps the first. Returns the stored report,
-- or null if the match doesn't exist.
create or replace function save_chaos_wrapped(p_match_id uuid, p_report jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update chaos_matches set wrapped = p_report where id = p_match_id and wrapped is null;
  return (select wrapped from chaos_matches where id = p_match_id);
end;
$$;

revoke all on function save_chaos_wrapped from public, anon, authenticated;
grant execute on function save_chaos_wrapped to service_role;

-- Feedback after a Mutation Machine match: one row per player per match, like Quick Party.
-- `game` stays when the links are cleared at room cleanup, so old ratings keep their game.
alter table feedback add column if not exists game text not null default 'mind_match'
  check (game in ('mind_match', 'mutation_machine'));
alter table feedback add column if not exists chaos_match_id uuid references chaos_matches (id) on delete set null;
alter table feedback drop constraint if exists feedback_chaos_match_player_key;
alter table feedback add constraint feedback_chaos_match_player_key unique (chaos_match_id, player_id);
