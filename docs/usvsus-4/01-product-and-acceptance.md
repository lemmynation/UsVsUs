# 01 — Product and acceptance criteria

**Promise:** _Your People. Your Chaos. Your Story._ Players create the chaos; each contribution changes the
next person's task. Phone = private controller, TV = public stage.

## Experiences and when they ship

| Experience                                                 | Players    | Length                | Ships                     | Account                      |
| ---------------------------------------------------------- | ---------- | --------------------- | ------------------------- | ---------------------------- |
| Quick Party (existing quiz rooms, packs, Wrapped, rematch) | 2–10       | ~10 min               | Live; must keep working   | No                           |
| **Duo Chaos** — Mutation Machine co-op                     | 2          | 3–6 min               | Sprint 1                  | No                           |
| **Circle Chaos** — Mutation Machine                        | 3–10       | 8–12 min (hypothesis) | Sprint 1                  | No                           |
| Party Screen (TV/laptop spectator)                         | +1 display | —                     | Sprint 2                  | No                           |
| Second game, Group Wrapped for chains                      | 3–10       | —                     | Sprint 3                  | No                           |
| Cosmetics → earnable Mystery Cards                         | —          | —                     | Sprints 4–5               | Persistence needs an account |
| Audio / camera mediums                                     | —          | —                     | Sprint 6, feature-flagged | No                           |
| Our Universe (accounts, persistent Circles, memories)      | —          | —                     | Sprint 7                  | Optional                     |

## Non-goals (first playable release)

Native TV apps, public feed, live video, AI scoring, face recognition, paid random rewards, subscriptions,
auto-posting, big profiles, a large library of untested mini-games.

## Sprint 1 acceptance criteria (Mutation Machine, phones only)

1. A host can create a **Chain Reactions** room from the landing page; invites, lobby, leave/kick and host
   handover work exactly like Quick Party.
2. Matches complete with **2, 3, 4, 6 and 10 players** (E2E for 2, 3 and 6; unit/property tests for all sizes).
3. Every step's job (create/mutate/detect) appears only on the assigned player's phone; **no projection or
   HTTP response leaks** an unrevealed card, another player's answer or another chain's artifact (negative tests).
4. Drawing works with touch and mouse (undo, clear, 4 colours); **"Describe instead"** completes the whole
   game without drawing, by keyboard and screen reader.
5. A late or missing player never blocks the match: host can close a step after the timer; placeholders
   replace missing work; nothing is auto-submitted.
6. Scores follow [03](03-mini-game-rules.md) exactly and are locked once per step (unit tests incl. retries).
7. Reveal shows every chain's lineage (original → mutation(s)) with the cards and who spotted them;
   reactions and Rematch work; a rematch avoids cards from the previous match.
8. **Quick Party is untouched:** the full existing test suite still passes; no existing room changes.
9. Accessibility: axe scan of every new screen, keyboard path, reduced motion, 44 px targets, small-phone layout.
10. Analytics events from [11](11-analytics.md) are recorded with no drawings or free text in payloads.

## Definition of done (every sprint)

Acceptance criteria written first; docs versioned; feature flag (`CHAIN_REACTIONS=on`, off in production
until approved); migration + rollback plan; server-side validation and negative security tests;
`npm run check`, `npm run test:e2e`, `npm run build` green; no broken Quick Party rooms; **no production
deploy or production schema change without separate owner approval**; manual iPhone Safari + Android Chrome
check of touch/drawing; changelog, known limitations and evidence (screenshots, test output).
