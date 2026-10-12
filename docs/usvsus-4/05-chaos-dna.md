# 05 — Chaos DNA (seeded variation)

Pure TypeScript in `lib/chaos/` (no Next.js or Supabase imports), unit-tested like `lib/game/`.

## Entities (Sprint 1 subset in bold)

```ts
type Medium = "drawing" | "text"; // audio/photo later (Sprint 6)
type StepKind = "create" | "mutate" | "detect";

interface GameDefinition {
  // **registry entry**
  id: "mutation_machine";
  version: number;
  minPlayers: 2;
  maxPlayers: 10;
  steps(playerCount: number): StepDefinition[];
}
interface StepDefinition {
  index: number;
  kind: StepKind;
  seconds: number;
  round: 1 | 2;
}
interface ObjectCard {
  id: string;
  label: string;
  family: string;
  contentVersion: number;
} // **seed prompt**
interface MutationCard {
  id: string;
  label: string;
  drawHint: string;
  family: string;
  contentVersion: number;
}
interface RoleAssignment {
  step: number;
  chain: number;
  playerId: string;
  role: "creator" | "mutator" | "detective";
}
interface RoundSeed {
  // **frozen plan, stored on the match**
  seed: number;
  gameVersion: number;
  contentVersion: number;
  playerOrder: string[];
  vibe: Vibe;
  objects: string[];
  mutations: string[][]; // [chain][mutationRound]
  assignments: RoleAssignment[];
  choices: Record<string /* chain:step */, { objects?: string[]; mutations?: string[] }>;
}
interface Artifact {
  chain: number;
  step: number;
  medium: Medium;
  strokes?: Stroke[];
  text?: string;
}
interface Contribution {
  matchId: string;
  chain: number;
  step: number;
  playerId: string;
  artifact?: Artifact;
  answer?: DetectAnswer;
}
interface DetectAnswer {
  objectId?: string;
  mutationId?: string;
}
interface ScoreRule {
  reason: "detect_mutation" | "detect_object" | "mutation_seen" | "object_seen";
  points: number;
}
type Vibe = "surprise" | "chill" | "chaos" | "deep";
```

Later sprints add `Modifier`, `Capability` (mic/camera), `ChainEdge` (collisions), `RevealStep`, `CosmeticItem`.

## Generator

```ts
planMatch(input: {
  playerIds: string[];          // join order
  vibe: Vibe;                   // filters/weights card families
  recent: { objects: string[]; mutations: string[] }; // fingerprints to avoid (this room's previous matches)
  seed: number;                 // stored; same input ⇒ same plan
  content: { objects: ObjectCard[]; mutations: MutationCard[] };
}): RoundSeed
```

- **RNG:** small seeded PRNG (mulberry32); the seed comes from `crypto` on the server and is stored.
- **Guarantees (property-tested over thousands of seeds):** no player assigned to detect a step they
  created or mutated; no card repeated within a match; no decoy equal to the answer; each choice list
  has 4 distinct families; every player has the same number of jobs per step (±0).
- **Repeat avoidance:** prefer cards not in `recent`; Sprint 1 keeps `recent` per room (rematches);
  cross-session fingerprints (like `question_history`) come later.
- **Fallback when content runs out:** reuse the least-recently used cards, never fail to plan.
- **Compatibility:** a mutation card can declare `incompatibleWith` families (e.g. "give it wheels" on a
  vehicle) and the generator won't pair them.
- **Stored for analytics:** only ids, versions and the seed, never drawings or text.

## Content files and validation

`content/chaos/objects.json`, `content/chaos/mutations.json`, validated with zod at build/test time (same as
`lib/game/questions.ts`). Content tests: minimum counts, unique ids, families present, emoji Unicode ≤ 12,
every card has a `drawHint`, and enough cards for 2 matches of 10 players without repeats.
