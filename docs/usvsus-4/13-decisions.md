# 13 — Owner decisions (decision gate)

Recommended defaults are marked ⭐. Sprint 1 needs only decisions **A–D**; the rest can be confirmed later,
but are recorded so nothing is invented silently.

## Needed before Sprint 1

**A. Build Mutation Machine with the rework in [02](02-originality-matrix.md)/[03](03-mini-game-rules.md)?**
⭐ Yes: untangle-the-chain deduction (original + mutation), stacked second mutation, parallel chains.
Alternative: build the spec's version as written (higher overlap with Telestrations/Patently Stupid).

**B. Scoring (spec open decision #1).**
⭐ Deduction scoring from [03](03-mini-game-rules.md): detectives +2 mutation / +1 original; creators and
mutators earn +1 per detective who spotted their part; Duo is co-op (team total + sync %). Positive titles only.
Trade-off: rewards clarity, which slightly favours good drawers; "Describe instead" and simple objects soften it.

**C. Player-count handling (open decision #6).**
⭐ One chain per player, all parallel; detection capped at 3 judges per chain, so 7–10 players add no waiting.
Alternative: 2–3 longer chains for big groups (more drama per chain, more idle time).

**D. Feature flag and rollout.**
⭐ Build behind `CHAIN_REACTIONS=on`, enabled in development only; production stays Quick Party-only until
you approve after playtests. Migration 10 applied to the development project only.

## Can be confirmed later (recommended defaults recorded)

| #   | Spec open decision              | ⭐ Recommendation                                                                                                                     | Trade-off                                                                    |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 2   | TV pairing UX                   | Code shown on the TV, typed on the host's phone, 5-min single-use, host approves                                                      | QR-scan-from-TV would need a camera on the phone flow and is easier to phish |
| 3   | Media retention & consent       | Drawings die with the room (30 days after expiry). Audio/photo the same; saving needs explicit per-creator consent, default off       | Less "memory vault" until accounts exist                                     |
| 4   | Auth provider & guest → account | Supabase Auth (email magic link + Google), linking the current session cookie's owned packs and history to the new account on sign-up | Adds an auth surface; only at Sprint 7                                       |
| 5   | Cosmetic art & performance      | Layered SVG, original art (commission or in-house), ≤ 30 KB per avatar, ≤ 3 animated layers, none on TV low-power path                | Art is the long pole; start sourcing early if Sprint 4 matters               |
| 7   | Purely cooperative Circle mode  | Not in Sprint 1. Duo is co-op; add a Circle "team score" toggle in Sprint 3 if playtests want it                                      | One more mode to test                                                        |

## Also worth your call

- **Name:** keep "Mutation Machine"? Other options: "Glitch Machine", "Mutant Factory".
- **Quick Party's place:** keep it as the default on the landing page until Chain Reactions passes playtests ⭐.
- **Playtests:** can you run 2 sessions with 4–6 people once Sprint 1 is on the development site?
