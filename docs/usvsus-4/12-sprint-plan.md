# 12 — Sprint plan, Sprint 1 contracts, tests and risks

## Sprints

| Sprint | Goal                                                                          | Gate                                                                                         |
| ------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0      | Audit, originality, these docs                                                | Owner approves [13](13-decisions.md); no code                                                |
| **1**  | Playable Mutation Machine, Duo + Circle, phones only                          | 3–6-player match completes; no hidden-answer leakage; all tests green; Quick Party untouched |
| 2      | Party Screen MVP (pairing, spectator view, QR join, TV reveal, host controls) | 6 phones + 1 TV complete a match; no private fields in spectator responses                   |
| 3      | Second game (from playtests), Group Wrapped for chains, polish                | 10-player test without long idle waits; repeat-play study                                    |
| 4      | Cosmetics foundation (session avatars)                                        | No scoring effect; performance budget                                                        |
| 5      | Earnable Mystery Cards                                                        | No double grant on retry; no paid randomness                                                 |
| 6      | Audio, then camera mediums (flagged)                                          | Real-device tests; playable without mic/camera                                               |
| 7      | Our Universe (accounts), then commercialization review                        | Privacy, deletion, entitlement tests                                                         |

## Sprint 1 contracts

### Routes (Next.js route handlers, existing session cookie, existing rate limits)

| Method & path                       | Who             | Body                                                                  | Result / errors                                                     |
| ----------------------------------- | --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `POST /api/rooms`                   | anyone          | `{ mode, nickname, roomName?, experience: "chain_reactions" }`        | existing; `experience` defaults to `quick_party`                    |
| `POST /api/rooms/:id/chaos/start`   | host            | `{ vibe? }`                                                           | `200` · `not_host`, `not_in_lobby`, `not_enough_players`            |
| `GET /api/rooms/:id`                | member          | —                                                                     | existing room view + `chaos: ChaosPlayerView \| null`               |
| `POST /api/rooms/:id/chaos/submit`  | assigned player | `{ step, chain, idempotencyKey, artifact? \| answer? }`               | `200 {version}` · `not_assigned`, `step_closed`, `invalid_artifact` |
| `POST /api/rooms/:id/chaos/advance` | host            | `{ stateVersion, action: "next" \| "skip_waiting" \| "reveal_next" }` | `200` · `stale_state`, `not_host`, `not_ready`                      |
| `POST /api/rooms/:id/chaos/swap`    | assigned player | `{ step, chain }`                                                     | `200` (new card in their view) · `swap_used`                        |
| `POST /api/rooms/:id/rematch`       | host            | —                                                                     | existing                                                            |

### Types (sketch; final in `types/chaos.ts`)

```ts
interface ChaosPlayerView {
  matchId: string;
  phase: "STEP_OPEN" | "REVEAL" | "RECAP";
  stateVersion: number;
  step: { index: number; count: number; kind: "create" | "mutate" | "detect"; deadline: string } | null;
  myJobs: Array<
    | { kind: "create"; chain: number; object: { label: string }; submitted: boolean }
    | {
        kind: "mutate";
        chain: number;
        base: Artifact;
        mutation: { label: string; drawHint: string };
        submitted: boolean;
      }
    | {
        kind: "detect";
        chain: number;
        artifact: Artifact;
        objectChoices?: Choice[];
        mutationChoices: Choice[];
        submitted: boolean;
      }
  >;
  submittedCount: number;
  expectedCount: number;
  reveal: ChainReveal | null; // only in REVEAL/RECAP
  recap: { titles: Record<string, string>; points: Record<string, number> } | null;
  canSwap: boolean;
}
```

### Modules

`lib/chaos/` — `registry.ts`, `rng.ts`, `plan.ts` (Chaos DNA), `assignments.ts`, `scoring.ts`,
`artifact.ts` (zod stroke/text schema + size limits), `projections.ts`, `state-machine.ts`, `service.ts`
(orchestration, deps injected). Store methods added to `RoomStore` (memory + Supabase, kept in parity).
UI: `components/chaos/*` (canvas, step screens, reveal, recap). Content: `content/chaos/*.json`.

## Task breakdown (small tested commits)

1. Content schemas + 80 objects / 40 mutations + content tests.
2. RNG + `planMatch` + assignment property tests (2–10 players, 5,000 seeds).
3. Scoring + titles (unit tests, incl. Duo).
4. Artifact schema + limits (unit tests, fuzzed bad payloads).
5. State machine (pure) + race tests.
6. Migration 10 (dev only) + `RoomStore` methods in both stores + parity tests.
7. Service + routes + projections + **leak tests**.
8. Canvas component (Pointer Events, undo/clear, layers) + "Describe instead".
9. Step screens, waiting/host controls, reveal + recap (reuse reactions/drumroll/rematch).
10. Landing entry + feature flag; analytics events; dashboard tiles.
11. E2E: Duo, 3-player, 6-player matches; leak checks on HTTP responses; a11y + small-phone layout;
    full existing suite still green.
12. Final pass, docs/changelog, evidence; PR. **No deploy, no production migration without approval.**

## Test plan

| Layer                      | What                                                                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                       | RNG determinism; assignments valid for every N and seed; choices (4 distinct families, answer present); scoring table incl. placeholders; titles; artifact validation; transitions incl. stale/duplicate |
| Integration (memory store) | Full matches for N = 2…10 through the service; replacement before lock; refusal after lock; player leaves; host handover                                                                                 |
| Security (negative)        | Projection leak tests per step; submit for an unassigned chain; oversized/garbage strokes; replay with same idempotency key                                                                              |
| E2E (Playwright)           | Duo, 3-player, 6-player; text-only player; late player + "skip waiting"; reveal + rematch; axe + layout; Quick Party suite unchanged                                                                     |
| Manual                     | iPhone Safari + Android Chrome drawing feel, scroll/zoom not stealing strokes                                                                                                                            |

## Risk register

| Risk                                                          | Impact | Mitigation                                                                             |
| ------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| Mutations not visible ⇒ detection is random, not fun          | High   | Card rule "visible in 30 s"; playtest stats per card; remove confusing cards           |
| Drawing on phones feels bad (scroll steals strokes, lag)      | High   | `touch-action: none` canvas, Pointer Events, real-device tests early (task 8 before 9) |
| 10-player reveal drags                                        | Medium | 12 s per chain, host skip, highlight reel later                                        |
| Leaks via a forgotten field                                   | High   | Projections built field by field + leak tests on real responses                        |
| Scope creep (TV, cosmetics) delays a playable game            | High   | Sprint 1 is phones-only; everything else gated                                         |
| Breaking Quick Party                                          | High   | Additive schema, `experience` default, existing suite must stay green                  |
| Payload size / DB growth                                      | Low    | 64 KB cap, cascade delete with rooms                                                   |
| Originality still too close to Telestrations in players' eyes | Medium | Playtest question: "what game does this remind you of?"; rework before Sprint 3        |
