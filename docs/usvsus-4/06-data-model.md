# 06 — Data model, migrations and RLS (draft — not applied)

All changes are **additive**, re-runnable migrations, applied to development first and to production only
with separate approval. Same access model as today: RLS on, **no policies**, only the server's secret key
through security-definer functions.

## Migration 10 — `chain_reactions` (Sprint 1)

```sql
alter table rooms add column if not exists experience text not null default 'quick_party'
  check (experience in ('quick_party', 'chain_reactions'));

create table if not exists chaos_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  game_id text not null,                    -- 'mutation_machine'
  plan jsonb not null,                      -- frozen RoundSeed (ids only, no player content)
  phase text not null check (phase in ('STEP_OPEN','STEP_LOCKED','REVEAL','RECAP')),
  step integer not null default 1,
  reveal_chain integer,
  state_version integer not null default 1,
  phase_started_at timestamptz not null default now(),
  step_deadline timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index on chaos_matches (room_id, started_at desc);

create table if not exists chaos_contributions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references chaos_matches (id) on delete cascade,
  step integer not null,
  chain integer not null,
  player_id uuid not null references players (id) on delete cascade,
  kind text not null check (kind in ('artifact','answer')),
  payload jsonb not null,                   -- validated strokes/text, or { objectId, mutationId }
  payload_bytes integer not null check (payload_bytes <= 65536),
  idempotency_key text not null,
  version integer not null default 1,       -- replacements before lock
  submitted_at timestamptz not null default now(),
  unique (match_id, step, chain, player_id)
);

create table if not exists chaos_scores (
  match_id uuid not null references chaos_matches (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  step integer not null, chain integer not null, reason text not null, points integer not null,
  primary key (match_id, player_id, step, chain, reason)
);
```

**Functions (security definer, granted to `service_role` only):**

- `start_chain_match(room, plan, now)` — LOBBY → IN_GAME and inserts the match, under the room lock (like `start_game`).
- `submit_contribution(match, step, chain, player, kind, payload, bytes, key, now)` — row lock on the match;
  accepts only if `phase = 'STEP_OPEN' and step = p_step` and the plan assigns this player; upsert by the
  unique key (replacement bumps `version`).
- `advance_chain_match(match, expected_version, next jsonb, now)` — compare-and-swap.
- `record_chain_scores(match, entries jsonb)` — insert … on conflict do nothing.

## Migration 11 — Party Screen (Sprint 2)

```sql
create table if not exists party_displays (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms (id) on delete cascade,   -- null until approved
  pairing_code_hash text not null,                         -- sha256 of the 6-char code
  token_hash text not null unique,                         -- spectator cookie (hashed, like sessions)
  status text not null check (status in ('pending','approved','revoked','expired')),
  approved_by_player_id uuid references players (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,                         -- pending: 5 min; approved: room lifetime
  last_seen_at timestamptz
);
```

## Later (Sprints 4–7), sketched only

`cosmetic_catalog` (data file + table), `cosmetic_inventory`, `equipped_cosmetics`, `reward_ledger`
(unique idempotency key per grant), `capsule_definitions`, `capsule_openings`, accounts tables. See
[09](09-cosmetics-and-rewards.md).

## Retention and cleanup

`chaos_*` rows cascade with their room, so the existing 30-days-after-expiry cleanup covers drawings with no
new job. `party_displays` older than a day are deleted by the same cleanup function (one more statement).
Drawings are never copied into analytics.

## Rollback plan

Every migration is additive: rolling back the _app_ is enough (old code ignores the new column/tables).
Dropping the tables is a separate, owner-approved step after data export if ever needed.
