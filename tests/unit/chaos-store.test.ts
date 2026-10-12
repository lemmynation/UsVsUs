import { beforeEach, describe, expect, it } from "vitest";
import { CHAOS_CONTENT } from "@/lib/chaos/content";
import { GAME_ID, planMatch, type MatchPlan } from "@/lib/chaos/plan";
import { MemoryRoomStore } from "@/lib/rooms/memory-store";
import type { ChaosMatch, ContributionPayload } from "@/types/chaos";
import type { Experience } from "@/types/room";

const NOW = "2026-10-12T10:00:00.000Z";
const drawing: ContributionPayload = {
  kind: "artifact",
  artifact: { medium: "drawing", strokes: [{ c: 0, w: 1, p: [1, 2, 3, 4] }] },
};

let store: MemoryRoomStore;
let codes = 0;
const nextCode = () => `ABC2${"ABCDEFGH"[codes++ % 8]}${"JKMNPQRS"[Math.floor(codes / 8) % 8]}`;
beforeEach(() => {
  store = new MemoryRoomStore();
});

async function room(experience: Experience, guests = ["Ana", "Ben"]) {
  const created = await store.createRoom({
    joinCode: nextCode(),
    mode: "circle",
    name: null,
    expiresAt: "2026-10-13T10:00:00.000Z",
    now: NOW,
    host: { nickname: "Lem", sessionTokenHash: "h0" },
    experience,
  });
  if (created === "join_code_taken") throw new Error("taken");
  const players = [created.host];
  for (const [i, nickname] of guests.entries()) {
    const p = await store.addPlayer({
      roomId: created.room.id,
      nickname,
      sessionTokenHash: `h${i + 1}`,
      maxPlayers: 10,
      now: NOW,
    });
    if (typeof p === "string") throw new Error(p);
    players.push(p);
  }
  return { room: created.room, players };
}

async function started(): Promise<{ match: ChaosMatch; plan: MatchPlan; roomId: string }> {
  const { room: r, players } = await room("chain_reactions");
  const plan = planMatch({ playerIds: players.map((p) => p.id), content: CHAOS_CONTENT, seed: 1 });
  const match = await store.startChainMatch({ roomId: r.id, minPlayers: 2, gameId: GAME_ID, plan, now: NOW });
  if (typeof match === "string") throw new Error(match);
  return { match, plan, roomId: r.id };
}

const job = (plan: MatchPlan, step: number) => plan.assignments.find((a) => a.step === step)!;

describe("Chain Reactions store", () => {
  it("creates rooms as Quick Party unless asked otherwise", async () => {
    const created = await store.createRoom({
      joinCode: "QWE234",
      mode: "couple",
      name: null,
      expiresAt: NOW,
      now: NOW,
      host: { nickname: "Lem", sessionTokenHash: "x" },
    });
    expect(created !== "join_code_taken" && created.room.experience).toBe("quick_party");
  });

  it("only starts a match in a Chain Reactions lobby with enough players", async () => {
    const quick = await room("quick_party");
    const plan = planMatch({ playerIds: quick.players.map((p) => p.id), content: CHAOS_CONTENT, seed: 1 });
    expect(await store.startChainMatch({ roomId: quick.room.id, minPlayers: 2, gameId: GAME_ID, plan, now: NOW })).toBe(
      "wrong_experience",
    );
    const lonely = await room("chain_reactions", []);
    expect(
      await store.startChainMatch({ roomId: lonely.room.id, minPlayers: 2, gameId: GAME_ID, plan, now: NOW }),
    ).toBe("not_enough_players");

    const { match, roomId } = await started();
    expect(match).toMatchObject({ phase: "STEP_OPEN", step: 1, stateVersion: 1 });
    expect((await store.getRoomById(roomId))!.status).toBe("IN_GAME");
    expect(await store.startChainMatch({ roomId, minPlayers: 2, gameId: GAME_ID, plan: match.plan, now: NOW })).toBe(
      "not_in_lobby",
    );
  });

  it("never starts a quiz in a Chain Reactions room (the store refuses, whatever the app read)", async () => {
    const chain = await room("chain_reactions");
    expect(await store.startGame({ roomId: chain.room.id, minPlayers: 2, rounds: [], now: NOW })).toBe(
      "wrong_experience",
    );
    expect((await store.getRoomById(chain.room.id))!.status).toBe("LOBBY");
  });

  it("accepts only the assigned player, treats a retry as a duplicate, and allows replacing before the step closes", async () => {
    const { match, plan } = await started();
    const mine = job(plan, 1);
    const someoneElse = plan.playerOrder.find((id) => id !== mine.playerId)!;
    const base = { matchId: match.id, step: 1, chain: mine.chain, payload: drawing, bytes: 40, now: NOW };

    expect(await store.submitContribution({ ...base, playerId: someoneElse, idempotencyKey: "key-aaaa1" })).toBe(
      "not_assigned",
    );
    expect(await store.submitContribution({ ...base, playerId: mine.playerId, idempotencyKey: "key-aaaa1" })).toBe(
      "ok",
    );
    expect(await store.submitContribution({ ...base, playerId: mine.playerId, idempotencyKey: "key-aaaa1" })).toBe(
      "duplicate",
    );
    expect(await store.submitContribution({ ...base, playerId: mine.playerId, idempotencyKey: "key-bbbb2" })).toBe(
      "ok",
    );
    const stored = (await store.listContributions(match.id)).filter((c) => c.playerId === mine.playerId);
    expect(stored).toHaveLength(1);
    expect(stored[0].version).toBe(2);
  });

  it("refuses work for a step that isn't open, and advances only with the current version", async () => {
    const { match, plan, roomId } = await started();
    const next = { phase: "STEP_OPEN" as const, step: 2, revealChain: null };
    const moved = await store.advanceChainMatch({ matchId: match.id, expectedVersion: 1, next, now: NOW });
    expect(moved).toMatchObject({ step: 2, stateVersion: 2 });
    expect(await store.advanceChainMatch({ matchId: match.id, expectedVersion: 1, next, now: NOW })).toBe("stale");

    const late = job(plan, 1);
    expect(
      await store.submitContribution({
        matchId: match.id,
        step: 1,
        chain: late.chain,
        playerId: late.playerId,
        payload: drawing,
        bytes: 40,
        idempotencyKey: "late-key-1",
        now: NOW,
      }),
    ).toBe("not_open");

    await store.advanceChainMatch({
      matchId: match.id,
      expectedVersion: 2,
      next: { phase: "RECAP", step: 5, revealChain: null },
      now: NOW,
    });
    expect((await store.getRoomById(roomId))!.status).toBe("WRAPPED");
    expect(await store.getLatestChainMatch(roomId)).toMatchObject({ phase: "RECAP", endedAt: NOW });
  });

  it("locks scores in once and skips players who left", async () => {
    const { match, plan } = await started();
    const [a, b] = plan.playerOrder;
    const entries = [
      { step: 3, chain: 0, playerId: a, reason: "detect_mutation" as const, points: 2 },
      { step: 3, chain: 0, playerId: b, reason: "mutation_seen" as const, points: 1 },
    ];
    await store.recordChainScores(match.id, entries);
    await store.recordChainScores(match.id, entries);
    expect(await store.listChainScores(match.id)).toHaveLength(2);

    await store.removePlayer(b);
    await store.recordChainScores(match.id, [{ ...entries[1], step: 5 }]);
    expect(await store.listChainScores(match.id)).toEqual([entries[0]]); // b's rows went with b
  });

  it("removes a player's contributions when they leave", async () => {
    const { match, plan } = await started();
    const mine = job(plan, 1);
    await store.submitContribution({
      matchId: match.id,
      step: 1,
      chain: mine.chain,
      playerId: mine.playerId,
      payload: drawing,
      bytes: 40,
      idempotencyKey: "key-cccc3",
      now: NOW,
    });
    await store.removePlayer(mine.playerId);
    expect(await store.listContributions(match.id)).toEqual([]);
  });
});
