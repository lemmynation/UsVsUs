import type { Artifact } from "@/lib/chaos/artifact";
import type { MatchPlan } from "@/lib/chaos/plan";
import type { ScoreEntry } from "@/lib/chaos/scoring";
import type { ChaosPhase } from "@/lib/chaos/state-machine";

/** A Chain Reactions match as stored. `plan` is frozen when it starts. */
export interface ChaosMatch {
  id: string;
  roomId: string;
  gameId: string;
  plan: MatchPlan;
  phase: ChaosPhase;
  step: number;
  revealChain: number | null;
  stateVersion: number;
  phaseStartedAt: string;
  startedAt: string;
  endedAt: string | null;
}

export type ContributionPayload = { kind: "artifact"; artifact: Artifact } | { kind: "answer"; answer: ChaosAnswer };

export interface ChaosAnswer {
  objectId?: string;
  mutationId?: string;
}

export interface ChaosContribution {
  matchId: string;
  step: number;
  chain: number;
  playerId: string;
  payload: ContributionPayload;
  version: number;
  submittedAt: string;
}

export type ChaosScoreEntry = ScoreEntry;
