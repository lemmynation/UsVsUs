# 03 — Mutation Machine: frozen rules (Sprint 1)

Everything here is deterministic: the same seed, player list and contributions always produce the same
assignments, choices and scores. Nothing is judged on artistic quality.

## Content

- **Seed objects** (`content/chaos/objects.json`): everyday, easy-to-draw things with a family tag
  (kitchen, animal, vehicle, furniture, tool…). Launch target: 80+.
- **Mutation cards** (`content/chaos/mutations.json`): a _visible_ change with a family tag
  (emotion, size, body, motion, element, purpose). Each card has `drawHint` (shown to the mutator) and
  `label` (shown in choices). Launch target: 40+. Every card must be drawable in about 30 seconds and visible
  in the finished drawing ("make it waterproof" is not; "it's on fire" is).

## Roles and assignment (players ordered by a seeded shuffle `p0 … pN-1`)

There is one **chain per player**: chain _i_ starts with `p_i`. All chains advance at the same time.

| Step             | Who, for chain _i_                      | Sees                                         | Does                                                         |
| ---------------- | --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| 1 · Create       | `p_i`                                   | A seed object (private)                      | Draws it (60 s) — or types a 6-word description              |
| 2 · Mutate       | `p_(i+1)`                               | Chain _i_'s drawing + a secret mutation card | Adds to the drawing (40 s); cannot erase the original        |
| 3 · Detect       | `p_(i+2+k)`, k < K₁                     | The finished drawing only                    | Picks the original object (1 of 4) and the mutation (1 of 4) |
| 4 · Mutate again | `p_(i+2)`                               | Chain _i_ as it stands + a second card       | Adds a second mutation (40 s)                                |
| 5 · Detect again | `p_(i+3+k)` excluding `p_(i+2)`, k < K₂ | The doubly mutated drawing                   | Picks which mutation was added _this time_ (1 of 4)          |
| 6 · Reveal       | Everyone (TV or phones)                 | Lineage per chain                            | React; titles; rematch                                       |

`K₁ = min(3, N − 2)`, `K₂ = min(3, N − 1)`. Indices are mod N. Because the offsets are uniform, **every player
does exactly one create, at most two mutations and the same number of detections per step**, so nobody waits
while others play. This is how 7–10 players are handled without sequential idle time.

### Player-count variants

| Players | Chains | Detectors per chain (step 3 / step 5) | Notes                                                                                                                                                                                                                           |
| ------- | ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2 (Duo) | 2      | — / —                                 | **Co-op variant:** after your partner mutates _your_ drawing, you detect the mutation (you know the original, so only the mutation question). Round 2 repeats with the partner's second card. Shared team score and a "sync" %. |
| 3       | 3      | 1 / 2                                 | Step 5 detectives include the original creator (they know the object, not the new mutation)                                                                                                                                     |
| 4–5     | 4–5    | 2–3 / 3                               | Default                                                                                                                                                                                                                         |
| 6–10    | 6–10   | 3 / 3                                 | Capped so the detect step lasts the same 45 s whatever the group size                                                                                                                                                           |

## Choices (generated, deterministic)

- **Original object:** the true seed + 3 decoys from _other_ families (so the right answer is defensible).
- **Mutation:** the true card + 3 decoys from _other_ families; never a card already used on that chain.
- Shuffled with the match seed; the same chain shows the same choices to every detective.

## Scoring (non-punitive, visible rules)

| Event                                       | Points                                         |
| ------------------------------------------- | ---------------------------------------------- |
| Detective picks the right mutation          | +2 to the detective, +1 to that step's mutator |
| Detective picks the right original (step 3) | +1 to the detective, +1 to the chain's creator |
| Skipped or missed step                      | 0, never negative                              |

Locked when the step closes (same "lock, then score once" rule as Quick Party). **Duo** shows only the team
total and a sync %, never a winner.

**Titles at the end (each player gets at most one, all positive):** _Sharp Eye_ (most correct detections),
_Clear Signal_ (creations most often identified), _Chaos Agent_ (the mutation that fooled the most people),
_Mind Meld_ (Duo, sync ≥ 75%), _Wildcard_ (fallback for everyone else).

## Timing and fairness

- Step timers: create 60 s, mutate 40 s, detect 45 s. **The host can close a step early** once everyone has
  submitted ("All in! Next") and can **skip waiting** for a stuck player after the timer.
- **No auto-submit of private content.** A missing drawing becomes a "🙈 skipped" placeholder: the chain
  continues, and the questions about the missing part are dropped (no points either way).
- **Swap card:** once per match, a player can swap an unsuitable seed or mutation for another.
- **Alternative modality:** "Describe instead" (text) is always available for create and mutate, so the
  game is playable with a keyboard, a screen reader or no drawing ability.

## Out of scope for Sprint 1 (recorded so they aren't invented later)

Collide/finale step (combining two chains Tee K.O.-style), voting, async play, audio/camera media,
cosmetics. Revisit after the first playtests.
