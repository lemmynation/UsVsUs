# UsVsUs 4.2 — Sprint 0 (audit, design, decision gate)

Source: `USVSUS_4_2_DEVELOPMENT_SPEC.docx` (10 Oct 2026). Sprint 0 changes **no application code and no
production data**. Everything here is a proposal until the owner approves the decisions in
[13-decisions.md](13-decisions.md).

| #   | Document                                                                  | What it answers                                             |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 01  | [Product & acceptance criteria](01-product-and-acceptance.md)             | What ships when, and how we know it works                   |
| 02  | [Originality matrix](02-originality-matrix.md)                            | Comparables, overlap, KEEP / REWORK / REJECT                |
| 03  | [Mini-game rules](03-mini-game-rules.md)                                  | Mutation Machine, frozen rules for 2–10 players             |
| 04  | [Multiplayer state machine](04-state-machine.md)                          | Match / step / contribution lifecycles, races               |
| 05  | [Chaos DNA](05-chaos-dna.md)                                              | Typed entities, seeded generator, content format            |
| 06  | [Data model & RLS](06-data-model.md)                                      | Additive migrations, keys, idempotency                      |
| 07  | [Projections & Party Screen security](07-projections-and-party-screen.md) | Player vs spectator data, TV pairing protocol, threat model |
| 08  | [UX wireframes](08-ux-wireframes.md)                                      | Phone controller and TV stage, screen by screen             |
| 09  | [Cosmetics & Mystery Cards](09-cosmetics-and-rewards.md)                  | Later sprints; ledger and inventory shape                   |
| 10  | [Media privacy](10-media-privacy.md)                                      | Drawing now; audio and camera later                         |
| 11  | [Analytics](11-analytics.md)                                              | Events, metrics, what never goes in payloads                |
| 12  | [Sprint plan & Sprint 1 contracts](12-sprint-plan.md)                     | Tasks, APIs, test plan, risk register                       |
| 13  | [Owner decisions](13-decisions.md)                                        | The 7 open questions with recommended defaults              |

## Repository audit (12 Oct 2026, `main` at `bb357df`)

**Stack actually in use** (matches the spec's assumptions, with these specifics):

- Next.js 16.4 with Cache Components, React 19, TypeScript strict, Tailwind v4, shadcn/ui, zod, Vitest,
  Playwright (+ axe). No canvas, audio or animation libraries installed.
- Supabase Postgres, RLS on with **no policies**; the browser's publishable key reads nothing. All data goes
  through Next route handlers with the secret key. Realtime is used only for a payload-free `room_changed`
  ping plus anonymous emoji reactions; clients refetch state.
- 9 additive migrations (`20261007…` → `20261015…`), all re-runnable, applied to both the development and
  production projects. 17 tables, 18 security-definer SQL functions.
- Anonymous sessions: httpOnly `uvu_session` cookie (~400 days, renewed on activity); only its SHA-256 hash
  is stored. No accounts.

**Existing systems 4.2 should reuse, not duplicate:**

| System                                              | Where                                                       | Reuse for Chain Reactions                                        |
| --------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Rooms, players, join codes, capacity, host handover | `lib/rooms/*`, `rooms`/`players` tables                     | Same lobby, invites and membership; a room gains an `experience` |
| Compare-and-swap game transitions                   | `lib/game/service.ts`, `advance_game`                       | Same pattern (`state_version`) for chain steps                   |
| Seeded question picking, repeat avoidance           | `lib/game/question-picker.ts`                               | Pattern for Chaos DNA content picking                            |
| Realtime ping + polling fallback + reconnect        | `hooks/use-room.ts`, `lib/realtime/*`                       | Unchanged; spectators poll their own endpoint                    |
| Reactions, drumroll, confetti, reduced motion       | `components/game/reveal-moments.tsx`, `reactions.tsx`       | Reveal on phones and TV                                          |
| Rematch, series score                               | `reopen_room`, `lib/game/series.ts`                         | Chain matches rematch the same way                               |
| Analytics, error monitoring, rate limits, retention | `lib/analytics/*`, `rate_limit_hit`, `cleanup_expired_data` | New event names, same pipeline                                   |
| Premium packs, owned packs, payment verification    | `lib/premium/*`                                             | Untouched in Sprints 1–6                                         |

**Baseline checks** (run on branch `usvsus-4-sprint0` before any change): see the report in the decision
gate message. `npm run check`, the full Playwright suite on a production build, and `npm run build`.

**Uncommitted work at audit time:** none (only the local `.claude/` tool folder, which is not part of the app).

## Deviations from the spec (proposed, need approval)

1. **Mutation Machine is reworked**, not built as written: the written loop overlaps Telestrations/Gartic
   Phone, Patently Stupid and Zendo. The proposal adds a layered "visible edit" + rule-deduction twist and
   parallel chains. See [02](02-originality-matrix.md) and [03](03-mini-game-rules.md).
2. **No new room lifecycle statuses.** The spec's room lifecycle (created → lobby → … → closed) maps onto the
   existing `LOBBY / IN_GAME / WRAPPED / …` statuses; the new detail lives in the chain match's own phases.
3. **Drawings are stored as validated vector stroke data in Postgres** (not files) for Sprint 1, so no storage
   bucket, signed URLs or media pipeline is needed until audio/camera (Sprint 6).
4. **Party Screen pairing uses a code shown on the TV and approved on the host's phone** (not a QR that the
   TV scans); see [07](07-projections-and-party-screen.md).

## Running checklist

- [x] Read the spec in full
- [x] Audit repo structure, migrations, sessions, realtime, analytics, payments, tests
- [x] Baseline checks (results in the gate report)
- [x] Competitive originality audit
- [x] Design documents 01–13
- [x] **Owner approves decisions (gate)**: A–D approved 12 Oct 2026
- [ ] Sprint 1 implementation (small tested commits, no deploy / production schema without separate approval)
