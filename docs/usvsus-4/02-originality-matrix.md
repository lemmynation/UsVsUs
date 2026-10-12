# 02 — Originality matrix

Originality is a hypothesis to test in playtests, not a guarantee. Comparables were checked on 12 Oct 2026
(sources at the end). Verdicts: **KEEP** (build as designed), **REWORK** (build only with the twist below),
**REJECT** (don't build).

## Mutation Machine (P0)

| Comparable                            | What it does                                                                | Overlap with the spec's version                             |
| ------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Telestrations / Gartic Phone (Normal) | Write → draw → describe the drawing → … ; reveal the whole chain at the end | Chained drawing + "reveal the lineage" is the same skeleton |
| Gartic Phone "Complement"             | Players add onto lines someone else started                                 | Editing someone else's drawing                              |
| Jackbox _Patently Stupid_             | Sketch an invention for a problem, name it, pitch it, vote                  | "Others infer purpose / name the machine"                   |
| Jackbox _Tee K.O._                    | Drawings and slogans made separately, combined, voted                       | Combining contributions into one artifact                   |
| _Zendo_                               | A moderator's secret rule; players deduce it from examples                  | "Others infer the secret rule"                              |

**Verdict: REWORK.** The spec's loop (create → secret rule transforms it → others infer rule/purpose →
becomes next seed) is a remix of those four. On its own each step would feel familiar, and "infer the
purpose" is judged by taste, which drifts back into scoring artistic skill.

**The twist (what changes the interaction, not the name):**

1. **Untangle the chain.** Detectives see only the _finished_ machine, one colour, no layers, and answer two
   concrete questions: _what was it before?_ and _which mutation was applied?_ Each has four choices. That
   is deduction with a right answer, so it can be scored without judging anyone's art.
2. **Divided loyalties.** Every player is, at the same moment, the creator of one chain, the mutator of
   another and a detective on others. Your chain scores when strangers can still see your toaster _and_ the
   mutation; your mutation scores when it's visible but your detectives still find the original. Clarity is
   rewarded and nobody is the "bad drawer" in the spotlight.
3. **The chain reacts.** In round 2 the mutated machine gets a _second_ secret mutation from someone new, and
   detectives must find what changed _this time_. Mutations stack, so the final reveal shows a genuine
   lineage (rubber duck → angry rubber duck → angry rubber duck on wheels) that nobody planned.
4. **Parallel chains.** One chain per player, all running at once, so a 10-player game has no waiting in line.

Closest comparable after the rework: Telestrations (chain + reveal). The difference that matters: players
_edit_ rather than redraw, and every step ends in a deduction with a right answer. **Fun benefit:** the laugh
of Telestrations' reveal plus a "did you get it?" moment on every chain. **Complexity cost:** two
multiple-choice questions per chain and a rule deck to write and balance. Explainable in 15 seconds: _"Draw
a thing. Someone secretly mutates it. Everyone else works out what it was and what happened to it."_

## The rest of the portfolio

| Game                      | Closest comparables                                     | Overlap                 | Proposed twist                                                                                                                               | Verdict                                                               |
| ------------------------- | ------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Butterfly Disaster (P1)   | Exquisite corpse, story-chain games, _Once Upon a Time_ | Linked story fragments  | Each branch must hit a hidden ending card only the last writer sees; others guess which ending was forced                                    | REWORK (Sprint 3, after Mutation Machine playtests)                   |
| Personality Creature (P1) | Who-said-it games, _Psych!_, Quiplash anonymous answers | Guessing who wrote what | Contributors pick traits of a shared mascot; provenance guessing only for consenting players. Already close to our existing anonymous voting | REWORK (decide after playtests)                                       |
| Memory Glitch (P2)        | Spot-the-difference, memory games                       | One changed fragment    | Little that's social; the "glitch" is a solo skill test                                                                                      | REJECT for now (revisit if a social twist emerges)                    |
| Sound Sculptor (P2)       | Telestrations with sound                                | Medium swap             | Keep the Mutation Machine structure with sound as the seed medium                                                                            | KEEP as a Sprint 6 _medium_ for Mutation Machine, not a separate game |
| Reality Remix (P2)        | Photo-markup apps, Drawful                              | Overlaying a photo      | Same: a camera _medium_ for Mutation Machine (photo seed + drawn mutation)                                                                   | KEEP as a Sprint 6 medium, behind a feature flag                      |
| Classic quizzes           | Psych!, Kahoot, our own Quick Party                     | —                       | Stays as Quick Party, unchanged                                                                                                              | KEEP (legacy, not flagship)                                           |

## Sources

- [Gartic Phone — all game modes ranked (TheGamer)](https://www.thegamer.com/gartic-phone-all-game-modes-ranked/)
- [Broken Picture Telephone (Wikipedia)](https://en.wikipedia.org/wiki/Broken_Picture_Telephone)
- [Competitive Analysis — Patently Stupid](https://mechanicsofmagic.com/2026/04/17/competitive-analysis-patently-stupid/)
- [Tee K.O. (Jackbox wiki)](https://jackboxgames.fandom.com/wiki/Tee_K.O.?oldid=3386)
- [Zendo rules (Looney Labs, PDF)](https://www.looneylabs.com/sites/default/files/literature/Zendo%20Rules%20Book%201.pdf)
- [Official Telestrations rules](https://officialgamerules.org/game-rules/telestrations/)

Not yet checked and worth a look before Sprint 3: Drawful (decoy titles), Wavelength (scale guessing),
skribbl.io (live guess-the-drawing).
