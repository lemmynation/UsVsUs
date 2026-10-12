/**
 * Runs Chain Reactions matches (docs/usvsus-4/04). The server decides every move;
 * each one is a compare-and-swap on the match's state_version, and a detect step's
 * points are locked in (idempotently) as it closes. No Next.js or Supabase here.
 */
import { loadMembership, type MembershipError } from "@/lib/rooms/membership";
import { activePlayers, type Result } from "@/lib/rooms/rules";
import type { RoomStore } from "@/lib/rooms/store";
import type { ChaosAnswer, ChaosContribution, ChaosMatch, ContributionPayload } from "@/types/chaos";
import type { Player, Room } from "@/types/room";
import { validateArtifact, type ArtifactError } from "./artifact";
import type { ChaosContent } from "./content";
import { choiceKey, GAME_ID, MAX_PLAYERS, MIN_PLAYERS, planMatch, type Vibe } from "./plan";
import { detectAnswers, missingWork, playerView, type ChaosPlayerView } from "./projections";
import { scoreDetectStep } from "./scoring";
import {
  decideAdvance,
  jobKey,
  stepAutoSkipAt,
  stepDeadline,
  type ChaosAction,
  type ChaosAdvanceError,
} from "./state-machine";

export interface ChaosServiceDeps {
  store: RoomStore;
  content: ChaosContent;
  now: () => Date;
  random: () => number;
  /** Called when the service moves a match on its own, so phones can be pinged. */
  onRoomChanged?: (roomId: string) => Promise<void>;
}

export type ChaosStartError =
  MembershipError | "not_host" | "not_in_lobby" | "wrong_experience" | "not_enough_players" | "too_many_players";
export type ChaosSubmitError =
  MembershipError | ArtifactError | "no_match" | "step_closed" | "not_assigned" | "invalid_answer";
export type ChaosMoveError = MembershipError | ChaosAdvanceError | "not_host" | "no_match" | "stale_state";

const ok = <T>(value: T) => ({ ok: true, value }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

export function createChaosService({ store, content, now, random, onRoomChanged }: ChaosServiceDeps) {
  const activeIds = (players: Player[]) => new Set(activePlayers(players).map((p) => p.id));

  /** Moves the match (CAS) and locks in a detect step's points as it closes. */
  async function move(match: ChaosMatch, action: ChaosAction, players: Player[]) {
    const contributions = await store.listContributions(match.id);
    const done = new Set(contributions.filter((c) => c.step === match.step).map(jobKey));
    const deadline = stepDeadline(match.plan, match.step, new Date(match.phaseStartedAt));
    const decision = decideAdvance({
      plan: match.plan,
      position: { phase: match.phase, step: match.step, revealChain: match.revealChain },
      action,
      activePlayerIds: activeIds(players),
      done,
      deadlinePassed: now().getTime() >= deadline.getTime(),
    });
    if (!decision.ok) return decision;

    const moved = await store.advanceChainMatch({
      matchId: match.id,
      expectedVersion: match.stateVersion,
      next: decision.next,
      now: now().toISOString(),
    });
    if (moved === "stale") return fail("stale_state" as const);
    // Score only after the step is closed: the store refuses answers from then on, so
    // nothing can land unscored. Re-scoring earlier steps is a no-op, and repairs a
    // request that died between closing a step and scoring it.
    await lockInClosedSteps(moved);
    return ok(moved);
  }

  async function lockInClosedSteps(match: ChaosMatch) {
    const closed = match.plan.steps.filter(
      (s) => s.kind === "detect" && (match.phase !== "STEP_OPEN" || s.index < match.step),
    );
    if (closed.length === 0) return;
    const contributions = await store.listContributions(match.id);
    const answers = detectAnswers(contributions);
    const entries = closed.flatMap((s) =>
      scoreDetectStep(match.plan, s.index as 3 | 5, answers, missingWork(match.plan, contributions, s.index)),
    );
    await store.recordChainScores(match.id, entries);
  }

  async function loadMatch(roomId: string, sessionHash: string) {
    const membership = await loadMembership(store, roomId, sessionHash);
    if (!membership.ok) return membership;
    const match = await store.getLatestChainMatch(roomId);
    if (!match || membership.value.room.status !== "IN_GAME") return fail("no_match" as const);
    return ok({ ...membership.value, match });
  }

  return {
    async start(
      roomId: string,
      sessionHash: string,
      options: { vibe?: Vibe } = {},
    ): Promise<Result<{ matchId: string }, ChaosStartError>> {
      const membership = await loadMembership(store, roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, players, me } = membership.value;
      if (!me.isHost || room.hostPlayerId !== me.id) return fail("not_host");
      if (room.experience !== "chain_reactions") return fail("wrong_experience");
      if (room.status !== "LOBBY") return fail("not_in_lobby");
      const active = activePlayers(players).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
      if (active.length < MIN_PLAYERS) return fail("not_enough_players");
      if (active.length > MAX_PLAYERS) return fail("too_many_players");

      // A rematch avoids the cards from this room's previous match.
      const previous = await store.getLatestChainMatch(roomId);
      const plan = planMatch({
        playerIds: active.map((p) => p.id),
        content,
        seed: Math.floor(random() * 2 ** 32),
        vibe: options.vibe,
        recent: previous
          ? {
              objectIds: previous.plan.chains.map((c) => c.objectId),
              mutationIds: previous.plan.chains.flatMap((c) => c.mutationIds),
            }
          : undefined,
      });
      const started = await store.startChainMatch({
        roomId,
        minPlayers: MIN_PLAYERS,
        gameId: GAME_ID,
        plan,
        now: now().toISOString(),
      });
      if (typeof started === "string") return fail(started);
      return ok({ matchId: started.id });
    },

    /** A create/mutate drawing or text, or a detect answer, for one of the caller's jobs. */
    async submit(
      roomId: string,
      sessionHash: string,
      input: { step: number; chain: number; idempotencyKey: string; artifact?: unknown; answer?: ChaosAnswer },
    ): Promise<Result<{ duplicate: boolean; advanced: boolean }, ChaosSubmitError>> {
      const loaded = await loadMatch(roomId, sessionHash);
      if (!loaded.ok) return loaded;
      const { match, me, players } = loaded.value;
      if (match.phase !== "STEP_OPEN" || match.step !== input.step) return fail("step_closed");
      const job = match.plan.assignments.find(
        (a) => a.step === input.step && a.chain === input.chain && a.playerId === me.id,
      );
      if (!job) return fail("not_assigned");
      const kind = match.plan.steps.find((s) => s.index === input.step)!.kind;

      let payload: ContributionPayload;
      let bytes: number;
      if (kind === "detect") {
        const set = match.plan.choices[choiceKey(input.chain, input.step)];
        const a = input.answer;
        const objectOk = set.objectIds
          ? !!a?.objectId && set.objectIds.includes(a.objectId)
          : a?.objectId === undefined;
        if (!a?.mutationId || !set.mutationIds.includes(a.mutationId) || !objectOk) return fail("invalid_answer");
        payload = {
          kind: "answer",
          answer: { mutationId: a.mutationId, ...(a.objectId ? { objectId: a.objectId } : {}) },
        };
        bytes = JSON.stringify(payload).length;
      } else {
        const artifact = validateArtifact(input.artifact);
        if (!artifact.ok) return fail(artifact.error);
        payload = { kind: "artifact", artifact: artifact.value };
        bytes = artifact.bytes;
      }

      const stored = await store.submitContribution({
        matchId: match.id,
        step: input.step,
        chain: input.chain,
        playerId: me.id,
        payload,
        bytes,
        idempotencyKey: input.idempotencyKey,
        now: now().toISOString(),
      });
      if (stored === "not_open") return fail("step_closed");
      if (stored === "not_assigned") return fail("not_assigned");
      // Everyone in? Move on now (a racing request may get there first; that's fine).
      const moved = stored === "ok" ? await move(match, "auto", players) : null;
      return ok({ duplicate: stored === "duplicate", advanced: !!moved?.ok });
    },

    /** Host actions: skip waiting (after the timer), next chain in the reveal, or straight to the recap. */
    async advance(
      roomId: string,
      sessionHash: string,
      input: { stateVersion: number; action: Exclude<ChaosAction, "auto"> },
    ): Promise<Result<{ phase: ChaosMatch["phase"] }, ChaosMoveError>> {
      const loaded = await loadMatch(roomId, sessionHash);
      if (!loaded.ok) return loaded;
      const { match, me, room, players } = loaded.value;
      if (!me.isHost || room.hostPlayerId !== me.id) return fail("not_host");
      if (match.stateVersion !== input.stateVersion) return fail("stale_state");
      const moved = await move(match, input.action, players);
      return moved.ok ? ok({ phase: moved.value.phase }) : moved;
    },

    /** After someone leaves, the people left may all be done: don't make them wait. */
    async afterRosterChange(roomId: string): Promise<boolean> {
      // Room first: Quick Party rooms never touch the chaos tables (which a database
      // without migration 10 doesn't have).
      const room = await store.getRoomById(roomId);
      if (!room || room.experience !== "chain_reactions" || room.status !== "IN_GAME") return false;
      const match = await store.getLatestChainMatch(roomId);
      if (!match || match.phase !== "STEP_OPEN") return false;
      const moved = await move(match, "auto", await store.listPlayers(roomId));
      if (moved.ok) await onRoomChanged?.(roomId);
      return moved.ok;
    },

    /**
     * Any member's refresh can move a step on once its overtime is up, so a match never
     * waits on a host who isn't looking. Compare-and-swap: only one refresh wins.
     */
    async catchUp(room: Room, players: Player[]): Promise<boolean> {
      if (room.experience !== "chain_reactions" || room.status !== "IN_GAME") return false;
      const match = await store.getLatestChainMatch(room.id);
      if (!match || match.phase !== "STEP_OPEN") return false;
      if (now() < stepAutoSkipAt(match.plan, match.step, new Date(match.phaseStartedAt))) return false;
      const moved = await move(match, "skip_waiting", players);
      if (moved.ok) await onRoomChanged?.(room.id);
      return moved.ok;
    },

    async viewFor(room: Room, players: Player[], me: Player): Promise<ChaosPlayerView | null> {
      if (room.experience !== "chain_reactions") return null;
      const match = await store.getLatestChainMatch(room.id);
      if (!match) return null;
      const [contributions, scores] = await Promise.all([
        store.listContributions(match.id),
        match.phase === "RECAP" ? store.listChainScores(match.id) : Promise.resolve([]),
      ]);
      return playerView({
        match,
        contributions: contributions as ChaosContribution[],
        scores,
        activePlayerIds: activeIds(players),
        meId: me.id,
        content,
      });
    },
  };
}

export type ChaosService = ReturnType<typeof createChaosService>;
