import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGameService, type GameService } from "@/lib/game/service";
import { BUNDLED_QUESTIONS } from "@/lib/game/questions";
import { GAME_CONFIG } from "@/lib/game/state-machine";
import { MemoryRoomStore } from "@/lib/rooms/memory-store";
import { createRoomService, type RoomService } from "@/lib/rooms/service";
import type { GameView, PlayerAnswer } from "@/types/game";
import type { Mode } from "@/types/room";

let store: MemoryRoomStore;
let rooms: RoomService;
let game: GameService;
let clock: Date;
let onRoomChanged: ReturnType<typeof vi.fn<(roomId: string) => Promise<void>>>;

beforeEach(() => {
  store = new MemoryRoomStore(structuredClone(BUNDLED_QUESTIONS)); // tests may edit their copy
  clock = new Date("2026-10-07T12:00:00Z");
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  onRoomChanged = vi.fn<(roomId: string) => Promise<void>>(async () => {});
  game = createGameService({ store, now: () => clock, random, onRoomChanged });
  let seq = 0;
  rooms = createRoomService({ store, now: () => clock, randomInt: (max) => seq++ % max, game });
});

const tick = (ms = 1000) => (clock = new Date(clock.getTime() + ms));

/** Creates a room with a host and guests, everyone on their own session hash. */
async function setup(mode: Mode = "couple", guests = ["Ana"]) {
  const created = await rooms.createRoom({ mode, nickname: "Lem", sessionHash: "host" });
  if (!created.ok) throw new Error(created.error);
  const room = created.value.room;
  for (const [i, nickname] of guests.entries()) {
    tick();
    const joined = await rooms.joinRoom({ code: room.joinCode, nickname, sessionHash: `g${i + 1}` });
    if (!joined.ok) throw new Error(joined.error);
  }
  return room;
}

async function view(roomId: string, hash: string): Promise<GameView> {
  const v = await rooms.getRoomView(roomId, hash);
  if (!v.ok) throw new Error(v.error);
  if (!v.value.game) throw new Error("no game");
  return v.value.game;
}

async function advance(roomId: string, hash = "host") {
  const v = await view(roomId, hash);
  const r = await game.advance(roomId, hash, v.stateVersion);
  if (!r.ok) throw new Error(r.error);
}

/**
 * Answers whatever is open, in the right shape for its game type: `pick` is an
 * option index (the same index is used for a This or That prediction), or "skip".
 */
async function answer(roomId: string, hash: string, pick: number | "skip" = 0) {
  const v = await view(roomId, hash);
  return game.submitAnswer(roomId, hash, { questionId: v.question!.id, answer: shapeAnswer(v, pick) });
}

function shapeAnswer(v: GameView, pick: number | "skip"): PlayerAnswer {
  if (pick === "skip") return { skipped: true };
  const id = v.question!.options[pick].id;
  if (v.gameType === "most_likely") return { targetPlayerId: id };
  if (v.gameType === "this_or_that" && v.standings.length > 0) return { optionId: id, predictionId: id };
  return { optionId: id };
}

async function startAndOpenFirstQuestion(roomId: string) {
  const started = await game.startGame(roomId, "host");
  if (!started.ok) throw new Error(started.error);
  await advance(roomId); // ROUND_INTRO → QUESTION_OPEN
}

describe("startGame", () => {
  it("plans 3 rounds of 5 distinct questions for the room's mode", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    const latest = await store.getLatestGame(room.id);
    expect(latest!.rounds).toHaveLength(GAME_CONFIG.rounds);
    const ids = latest!.rounds.flatMap((r) => r.questionIds);
    expect(ids).toHaveLength(GAME_CONFIG.rounds * GAME_CONFIG.questionsPerRound);
    expect(new Set(ids).size).toBe(ids.length);
    const bank = await store.getQuestions();
    expect(ids.every((id) => bank.find((q) => q.id === id)!.modes.includes("couple"))).toBe(true);
    expect((await store.getRoomById(room.id))!.status).toBe("IN_GAME");
  });

  it("opens on the round intro for everyone", async () => {
    const room = await setup();
    await game.startGame(room.id, "host");
    const v = await view(room.id, "g1");
    expect(v).toMatchObject({ phase: "ROUND_INTRO", roundIndex: 0, roundCount: 3, question: null });
  });

  it("still enforces host-only and minimum players", async () => {
    const room = await setup("couple", []);
    expect(await game.startGame(room.id, "host")).toEqual({ ok: false, error: "not_enough_players" });
    const room2 = await setup("couple");
    expect(await game.startGame(room2.id, "g1")).toEqual({ ok: false, error: "not_host" });
  });
});

describe("answers stay private until the reveal", () => {
  it("shows who answered but not what", async () => {
    const room = await setup();
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", 1);

    const guestView = await view(room.id, "g1");
    expect(guestView.phase).toBe("QUESTION_OPEN");
    expect(guestView.answeredPlayerIds).toHaveLength(1);
    expect(guestView.myAnswer).toBeNull();
    expect(guestView.reveal).toBeNull();
    expect(JSON.stringify(guestView)).not.toMatch(/"optionId"/);

    const hostView = await view(room.id, "host");
    expect(hostView.myAnswer).toEqual({ optionId: "b" }); // you can always see your own
  });

  it("reveals automatically once everyone has answered, with all answers", async () => {
    const room = await setup();
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", 0);
    const last = await answer(room.id, "g1", 1);
    expect(last).toMatchObject({ ok: true, value: { revealed: true } });

    const v = await view(room.id, "g1");
    expect(v.phase).toBe("REVEAL");
    expect(v.reveal!.answers!.map((a) => a.answer.optionId).sort()).toEqual(["a", "b"]);
  });
});

describe("submitAnswer", () => {
  it("keeps the first answer; a retry is a harmless duplicate", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", 0);
    expect(await answer(room.id, "host", 1)).toMatchObject({ ok: true, value: { duplicate: true } });
    expect((await view(room.id, "host")).myAnswer).toEqual({
      targetPlayerId: (await view(room.id, "host")).question!.options[0].id,
    });
  });

  it("rejects options that don't exist", async () => {
    const room = await setup();
    await startAndOpenFirstQuestion(room.id);
    expect(
      await game.submitAnswer(room.id, "host", {
        questionId: (await view(room.id, "host")).question!.id,
        answer: { optionId: "z" },
      }),
    ).toEqual({ ok: false, error: "invalid_answer" });
  });

  it("rejects answers to a question that isn't open", async () => {
    const room = await setup();
    await game.startGame(room.id, "host"); // still on the intro
    expect(
      await game.submitAnswer(room.id, "host", { questionId: "tot-cats-or-dogs", answer: { optionId: "a" } }),
    ).toEqual({
      ok: false,
      error: "not_open",
    });
  });

  it("rejects a late answer to the previous question", async () => {
    const room = await setup();
    await startAndOpenFirstQuestion(room.id);
    const first = (await view(room.id, "host")).question!.id;
    await answer(room.id, "host");
    await answer(room.id, "g1"); // → REVEAL
    await advance(room.id); // → next question
    expect(await game.submitAnswer(room.id, "host", { questionId: first, answer: { optionId: "a" } })).toEqual({
      ok: false,
      error: "not_open",
    });
  });

  it("rejects non-members", async () => {
    const room = await setup();
    await startAndOpenFirstQuestion(room.id);
    expect(await game.submitAnswer(room.id, "stranger", { questionId: "x", answer: { optionId: "a" } })).toEqual({
      ok: false,
      error: "not_in_room",
    });
  });
});

describe("advance", () => {
  it("ignores a double tap: the second request with the old version is stale", async () => {
    const room = await setup();
    await game.startGame(room.id, "host");
    const { stateVersion } = await view(room.id, "host");
    expect((await game.advance(room.id, "host", stateVersion)).ok).toBe(true);
    expect(await game.advance(room.id, "host", stateVersion)).toEqual({ ok: false, error: "stale_state" });
    expect((await view(room.id, "host")).phase).toBe("QUESTION_OPEN");
  });

  it("lets the host reveal early once someone has answered", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await startAndOpenFirstQuestion(room.id);
    const v = await view(room.id, "host");
    expect(await game.advance(room.id, "host", v.stateVersion)).toEqual({ ok: false, error: "no_answers_yet" });
    await answer(room.id, "g1");
    await advance(room.id);
    expect((await view(room.id, "host")).phase).toBe("REVEAL");
  });

  it("is host-only", async () => {
    const room = await setup();
    await game.startGame(room.id, "host");
    const v = await view(room.id, "g1");
    expect(await game.advance(room.id, "g1", v.stateVersion)).toEqual({ ok: false, error: "not_host" });
  });

  it("plays a whole game through to FINISHED and wraps the room", async () => {
    const room = await setup();
    await game.startGame(room.id, "host");
    const phases: string[] = [];
    for (let guard = 0; guard < 100; guard++) {
      const v = await view(room.id, "host");
      phases.push(v.phase);
      if (v.phase === "FINISHED") break;
      if (v.phase === "QUESTION_OPEN") {
        await answer(room.id, "host");
        await answer(room.id, "g1");
      } else {
        await advance(room.id);
      }
    }
    expect(phases.at(-1)).toBe("FINISHED");
    expect(phases.filter((p) => p === "REVEAL")).toHaveLength(15);
    expect(phases.filter((p) => p === "SCOREBOARD")).toHaveLength(3);
    expect((await store.getRoomById(room.id))!.status).toBe("WRAPPED");
  });
});

describe("roster changes mid-question", () => {
  it("reveals when the only player still thinking leaves", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host");
    await answer(room.id, "g1");
    await rooms.leaveRoom(room.id, "g2");
    expect((await view(room.id, "host")).phase).toBe("REVEAL");
  });

  it("reveals when the host removes the last player who hadn't answered", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host");
    await answer(room.id, "g1");
    const ben = (await store.listPlayers(room.id)).find((p) => p.nickname === "Ben")!;
    await rooms.kickPlayer(room.id, "host", ben.id);
    expect((await view(room.id, "host")).phase).toBe("REVEAL");
  });
});

describe("question deactivated mid-game", () => {
  it("still shows and accepts answers for a question the room is already on", async () => {
    const room = await setup();
    await startAndOpenFirstQuestion(room.id);
    const current = (await view(room.id, "host")).question!.id;
    const bank = await store.getQuestions();
    bank.find((q) => q.id === current)!.active = false; // someone retires it from the bank

    expect((await view(room.id, "g1")).question?.id).toBe(current);
    await answer(room.id, "host");
    expect(await answer(room.id, "g1")).toMatchObject({ ok: true, value: { revealed: true } });
  });
});

describe("refresh / reconnect", () => {
  it("returns a player to the same step with their answer still locked in", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "g1", 1);
    const again = await view(room.id, "g1"); // a fresh load is just another view
    expect(again).toMatchObject({
      phase: "QUESTION_OPEN",
      myAnswer: { targetPlayerId: again.question!.options[1].id },
    });
  });
});

describe("host hand-off", () => {
  it("passes host to a player who is still here after the host is gone for a minute", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await game.startGame(room.id, "host");
    tick(GAME_CONFIG.hostAwayMs + 1000);
    // Ana's phone checks in; Ben has also been quiet, so Ana is the one who's here.
    const v = await rooms.getRoomView(room.id, "g1");
    if (!v.ok) throw new Error(v.error);
    expect(v.value.me.isHost).toBe(true);
    expect(v.value.players.find((p) => p.nickname === "Lem")!.isHost).toBe(false);
    expect(v.value.players.find((p) => p.nickname === "Ben")!.isHost).toBe(false);
    expect(onRoomChanged).toHaveBeenCalledWith(room.id);

    // The new host can drive the game.
    expect((await game.advance(room.id, "g1", v.value.game!.stateVersion)).ok).toBe(true);
  });

  it("prefers the earliest-joined among players who are here", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await game.startGame(room.id, "host");
    // Keep the host fresh while Ana and Ben check in, then let the host go quiet.
    await view(room.id, "g2");
    await view(room.id, "g1");
    const hostPlayer = (await store.listPlayers(room.id)).find((p) => p.isHost)!;
    await store.touchPlayer(hostPlayer.id, new Date(clock.getTime() - GAME_CONFIG.hostAwayMs - 1).toISOString());
    await view(room.id, "g2"); // Ben triggers the check, but Ana joined first and is here too
    const players = await store.listPlayers(room.id);
    expect(players.find((p) => p.nickname === "Ana")!.isHost).toBe(true);
  });

  it("does not pass host in the lobby (host may be away sharing the link)", async () => {
    const room = await setup();
    tick(GAME_CONFIG.hostAwayMs * 3);
    const v = await rooms.getRoomView(room.id, "g1");
    if (!v.ok) throw new Error(v.error);
    expect(v.value.me.isHost).toBe(false);
  });

  it("does not pass host while the host is still around", async () => {
    const room = await setup();
    await game.startGame(room.id, "host");
    tick(GAME_CONFIG.hostAwayMs - 5000);
    const v = await rooms.getRoomView(room.id, "g1");
    if (!v.ok) throw new Error(v.error);
    expect(v.value.me.isHost).toBe(false);
  });
});

describe("no repeats across games", () => {
  it("a second game for the same people avoids questions they've already seen", async () => {
    const first = await setup("couple");
    await game.startGame(first.id, "host");
    // Play the first game through so every question is revealed (and recorded as seen).
    for (let guard = 0; guard < 100; guard++) {
      const v = await view(first.id, "host");
      if (v.phase === "FINISHED") break;
      if (v.phase === "QUESTION_OPEN") {
        await answer(first.id, "host");
        await answer(first.id, "g1");
      } else await advance(first.id);
    }
    const seen = new Set((await store.getLatestGame(first.id))!.rounds.flatMap((r) => r.questionIds));

    const second = await setup("couple"); // same two browser sessions ("host", "g1")
    await game.startGame(second.id, "host");
    const next = (await store.getLatestGame(second.id))!.rounds.flatMap((r) => r.questionIds);
    expect(next.filter((id) => seen.has(id))).toEqual([]);
  });
});

/** Plays until `stop` matches (or the game ends), answering everything with `pick`. */
async function playTo(roomId: string, hashes: string[], stop: (v: GameView) => boolean, pick = 0) {
  for (let guard = 0; guard < 200; guard++) {
    const v = await view(roomId, "host");
    if (stop(v) || v.phase === "FINISHED") return v;
    if (v.phase === "QUESTION_OPEN") for (const h of hashes) await answer(roomId, h, pick);
    else await advance(roomId);
  }
  throw new Error("game did not reach the expected step");
}

describe("Phase 3: round lineups", () => {
  it("plays Mind Reader, This or That, Who's More Likely in Couple, alternating the subject", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    const { rounds } = (await store.getLatestGame(room.id))!;
    expect(rounds.map((r) => r.gameType)).toEqual(["mind_reader", "this_or_that", "most_likely"]);
    const [host, guest] = (await store.listPlayers(room.id)).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
    expect(rounds[0].subjectPlayerIds).toEqual([host.id, guest.id, host.id, guest.id, host.id]);
    expect(rounds[1].subjectPlayerIds.every((s) => s === null)).toBe(true);
  });

  it("plays Who's More Likely, This or That, Who's More Likely in Circle with no repeated question", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await game.startGame(room.id, "host");
    const { rounds } = (await store.getLatestGame(room.id))!;
    expect(rounds.map((r) => r.gameType)).toEqual(["most_likely", "this_or_that", "most_likely"]);
    const ids = rounds.flatMap((r) => r.questionIds);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Phase 3: Mind Reader", () => {
  it("tells each player their role and fills in the subject's name", async () => {
    const room = await setup("couple");
    await startAndOpenFirstQuestion(room.id);
    const hostView = await view(room.id, "host");
    const guestView = await view(room.id, "g1");
    expect(hostView.myRole).toBe("subject"); // host joined first → first subject
    expect(guestView.myRole).toBe("predictor");
    expect(hostView.question!.prompt).toContain("Lem");
    expect(hostView.question!.prompt).not.toContain("{name}");
  });

  it("gives the predictor 100 for a correct guess and locks it into the standings", async () => {
    const room = await setup("couple");
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", 1); // subject's truth
    await answer(room.id, "g1", 1); // correct guess
    const v = await view(room.id, "g1");
    const guestId = v.standings.find((s) => s.points > 0)!.playerId;
    expect(v.reveal!.points).toEqual({ [guestId]: 100 });
    expect(v.standings.map((s) => s.points)).toEqual([100, 0]);
  });

  it("never shows the subject's answer to the predictor before the reveal", async () => {
    const room = await setup("couple");
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", 1);
    const v = await view(room.id, "g1");
    expect(v.reveal).toBeNull();
    expect(v.myAnswer).toBeNull();
    expect(JSON.stringify(v)).not.toContain('"optionId"');
  });
});

describe("Phase 3: This or That with predictions", () => {
  it("requires a prediction in 2-player modes", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    await playTo(room.id, ["host", "g1"], (v) => v.gameType === "this_or_that" && v.phase === "QUESTION_OPEN");
    const v = await view(room.id, "host");
    expect(await game.submitAnswer(room.id, "host", { questionId: v.question!.id, answer: { optionId: "a" } })).toEqual(
      {
        ok: false,
        error: "invalid_answer",
      },
    );
  });

  it("gives 50 to each player who guessed their partner's pick", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    await playTo(room.id, ["host", "g1"], (v) => v.gameType === "this_or_that" && v.phase === "QUESTION_OPEN", 1);
    const before = Object.fromEntries((await view(room.id, "host")).standings.map((s) => [s.playerId, s.points]));
    await answer(room.id, "host", 0); // picks a, predicts a
    await answer(room.id, "g1", 0); // picks a, predicts a → both right
    const v = await view(room.id, "host");
    for (const s of v.standings) expect(s.points - before[s.playerId]).toBe(50);
  });
});

describe("Phase 3: Who's More Likely", () => {
  it("gives 75 each when a couple picks the same person", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    await playTo(room.id, ["host", "g1"], (v) => v.gameType === "most_likely" && v.phase === "QUESTION_OPEN", 1);
    expect((await view(room.id, "host")).question!.options).toHaveLength(2); // the two players
    await answer(room.id, "host", 1);
    await answer(room.id, "g1", 1);
    const v = await view(room.id, "host");
    expect(Object.values(v.reveal!.points)).toEqual([75, 75]);
  });

  it("keeps Circle votes anonymous: counts and a badge, never who voted for whom", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", 2);
    await answer(room.id, "g1", 2);
    await answer(room.id, "g2", 0);
    const v = await view(room.id, "g1");
    const winner = v.question!.options[2].id;
    expect(v.reveal!.answers).toBeNull();
    expect(v.reveal!.votes!.map((x) => x.count)).toEqual([2, 1]);
    expect(v.reveal!.award!.playerIds).toEqual([winner]);
    expect(v.reveal!.points).toEqual({});
    expect(v.standings).toEqual([]);
    expect(v.awards).toEqual([{ label: v.reveal!.award!.label, playerId: winner }]);
    // The viewer sees only their own vote; the reveal carries no voter ids at all.
    expect(v.myAnswer).toEqual({ targetPlayerId: winner });
    expect(JSON.stringify(v.reveal)).not.toContain('"playerId"');
  });

  it("rejects a vote for someone who isn't in the room", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await startAndOpenFirstQuestion(room.id);
    const v = await view(room.id, "host");
    expect(
      await game.submitAnswer(room.id, "host", {
        questionId: v.question!.id,
        answer: { targetPlayerId: crypto.randomUUID() },
      }),
    ).toEqual({ ok: false, error: "invalid_answer" });
  });
});

describe("Phase 3: skipping", () => {
  it("counts as answered (so the reveal still happens) and scores nothing", async () => {
    const room = await setup("couple");
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", "skip"); // the subject skips
    expect(await answer(room.id, "g1", 0)).toMatchObject({ ok: true, value: { revealed: true } });
    const v = await view(room.id, "g1");
    expect(v.reveal!.points).toEqual({});
    expect(v.reveal!.skippedCount).toBe(1);
  });
});

describe("Phase 3: points are locked in", () => {
  it("are never counted twice, even though the reveal is scored again on the way out", async () => {
    const room = await setup("couple");
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", 1);
    await answer(room.id, "g1", 1);
    await advance(room.id); // leaving the reveal re-records (idempotently)
    expect((await view(room.id, "host")).standings.map((s) => s.points)).toEqual([100, 0]);
  });

  it("survive the partner leaving afterwards", async () => {
    const room = await setup("couple");
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", 1); // host is the subject
    await answer(room.id, "g1", 1); // guest earns 100
    await rooms.leaveRoom(room.id, "host");
    const v = await view(room.id, "g1");
    expect(v.standings).toHaveLength(1);
    expect(v.standings[0].points).toBe(100);
  });

  it("add up correctly over a whole Couple game", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    const end = await playTo(room.id, ["host", "g1"], () => false, 0);
    expect(end.phase).toBe("FINISHED");
    // Everyone always picks option 0, so every guess is right and every vote agrees.
    // Mind Reader: host is subject on q1,3,5 → Ana guesses 3×100; Lem guesses 2×100.
    // This or That: 5×50 each. Who's More Likely: 5×75 each.
    const players = await store.listPlayers(room.id);
    const byName = Object.fromEntries(
      end.standings.map((s) => [players.find((p) => p.id === s.playerId)!.nickname, s.points]),
    );
    expect(byName).toEqual({ Lem: 200 + 250 + 375, Ana: 300 + 250 + 375 });
  });
});

describe("review pass: edge cases", () => {
  it("ends a 2-player game when the partner leaves mid-question, keeping points earned", async () => {
    const room = await setup("couple");
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", 1);
    await answer(room.id, "g1", 1); // Ana earns 100
    await advance(room.id); // next question
    await rooms.leaveRoom(room.id, "host");

    const v = await view(room.id, "g1");
    expect(v.phase).toBe("FINISHED");
    expect(v.standings).toEqual([{ playerId: expect.any(String), points: 100 }]);
    expect((await store.getRoomById(room.id))!.status).toBe("WRAPPED");
  });

  it("ends the game when the host removes the only other player", async () => {
    const room = await setup("friends");
    await startAndOpenFirstQuestion(room.id);
    const ana = (await store.listPlayers(room.id)).find((p) => p.nickname === "Ana")!;
    await rooms.kickPlayer(room.id, "host", ana.id);
    expect((await view(room.id, "host")).phase).toBe("FINISHED");
  });

  it("keeps a Circle game going while at least two players remain", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await startAndOpenFirstQuestion(room.id);
    await rooms.leaveRoom(room.id, "g2");
    expect((await view(room.id, "host")).phase).toBe("QUESTION_OPEN");
  });

  it("doesn't hand a Circle badge to someone who left before the reveal", async () => {
    const room = await setup("circle", ["Ana", "Ben", "Cy", "Dee"]);
    await startAndOpenFirstQuestion(room.id);
    const players = await store.listPlayers(room.id);
    const ben = players.find((p) => p.nickname === "Ben")!;
    const ana = players.find((p) => p.nickname === "Ana")!;
    const q = (await view(room.id, "host")).question!.id;
    const vote = (hash: string, targetPlayerId: string) =>
      game.submitAnswer(room.id, hash, { questionId: q, answer: { targetPlayerId } });
    await vote("host", ben.id);
    await vote("g3", ben.id);
    await vote("g1", ana.id);
    await vote("g4", ana.id); // Ben 2, Ana 2 — a shared badge, until…
    await rooms.leaveRoom(room.id, "g2"); // Ben leaves; everyone left has answered → reveal

    const v = await view(room.id, "host");
    expect(v.phase).toBe("REVEAL");
    expect(v.reveal!.votes).toEqual([{ targetPlayerId: ana.id, count: 2 }]);
    expect(v.reveal!.award!.playerIds).toEqual([ana.id]);
    expect(v.reveal!.skippedCount).toBe(2);
  });
});

describe("Phase 4: Wrapped", () => {
  it("freezes a report when the game finishes, matching the final Game Score", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    const end = await playTo(room.id, ["host", "g1"], () => false, 0);
    const report = end.wrapped!;
    expect(report).toBeTruthy();
    expect(await store.getWrapped(end.sessionId)).toEqual(report); // saved, not just computed

    // Everyone always picks option 0, so every point on offer was won.
    expect(report.usScore).toBe(100);
    expect(report.players.map((p) => [p.nickname, p.points])).toEqual([
      ["Ana", 925],
      ["Lem", 825],
    ]);
    expect(report.winnerIds).toEqual([report.players[0].id]);
    expect(report.rounds.map((r) => r.gameType)).toEqual(["mind_reader", "this_or_that", "most_likely"]);
    expect(report.rounds.map((r) => r.possible)).toEqual([500, 500, 750]);
    expect(report.endedEarly).toBe(false);
  });

  it("stays the same for everyone, even after a player leaves", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    const end = await playTo(room.id, ["host", "g1"], () => false, 1);
    const before = end.wrapped!;
    expect((await view(room.id, "g1")).wrapped).toEqual(before);

    await rooms.leaveRoom(room.id, "g1");
    const after = (await view(room.id, "host")).wrapped!;
    expect(after).toEqual(before);
    expect(after.players.map((p) => p.nickname).sort()).toEqual(["Ana", "Lem"]);
  });

  it("is rebuilt (once) if the finish was interrupted before it was saved", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    await playTo(room.id, ["host", "g1"], (v) => v.phase === "SCOREBOARD" && v.roundIndex === 2);
    const latest = (await store.getLatestGame(room.id))!;
    // Finish behind the service's back, as if the request died right after the move.
    await store.advanceGame({
      sessionId: latest.session.id,
      expectedVersion: latest.session.stateVersion,
      next: { phase: "FINISHED", roundIndex: latest.session.roundIndex, questionIndex: latest.session.questionIndex },
      now: clock.toISOString(),
    });
    expect(await store.getWrapped(latest.session.id)).toBeNull();
    const first = (await view(room.id, "host")).wrapped;
    expect(first).toBeTruthy();
    expect((await view(room.id, "g1")).wrapped).toEqual(first);
  });

  it("marks a game that ended early, with no winner or Us Score", async () => {
    const room = await setup("couple");
    await startAndOpenFirstQuestion(room.id);
    await answer(room.id, "host", 1);
    await answer(room.id, "g1", 1); // Ana earns 100
    await advance(room.id);
    await rooms.leaveRoom(room.id, "host");

    const report = (await view(room.id, "g1")).wrapped!;
    expect(report).toMatchObject({ endedEarly: true, winnerIds: null, usScore: null });
    expect(report.players.map((p) => [p.nickname, p.points])).toEqual([["Ana", 100]]);
  });

  it("counts the question the game stopped on only if it had been revealed", async () => {
    // Circle keeps answers from the people who stay, so the stop question is observable.
    const stopDuringReveal = await setup("circle", ["Ana", "Ben"]);
    await startAndOpenFirstQuestion(stopDuringReveal.id);
    for (const h of ["host", "g1", "g2"]) await answer(stopDuringReveal.id, h, 0); // → REVEAL
    await rooms.leaveRoom(stopDuringReveal.id, "g2");
    await rooms.leaveRoom(stopDuringReveal.id, "g1"); // down to 1 → ends during the reveal
    const revealed = (await view(stopDuringReveal.id, "host")).wrapped!;
    expect(revealed.endedEarly).toBe(true);
    expect(revealed.awards).toHaveLength(1); // the badge locked in at that reveal

    const stopMidQuestion = await setup("circle", ["Ana", "Ben"]);
    await startAndOpenFirstQuestion(stopMidQuestion.id);
    await answer(stopMidQuestion.id, "host", 0);
    await rooms.leaveRoom(stopMidQuestion.id, "g2");
    await rooms.leaveRoom(stopMidQuestion.id, "g1"); // ends before anything was revealed
    const unrevealed = (await view(stopMidQuestion.id, "host")).wrapped!;
    expect(unrevealed).toMatchObject({ endedEarly: true, awards: [], highlight: null });
  });

  it("keeps Circle anonymous: badges and counts, never who voted for whom", async () => {
    const room = await setup("circle", ["Ana", "Ben"]);
    await game.startGame(room.id, "host");
    const end = await playTo(room.id, ["host", "g1", "g2"], () => false, 0);
    const report = end.wrapped!;
    expect(report.awards.length).toBeGreaterThan(0);
    expect(report.usScore).toBeNull();
    expect(JSON.stringify(report)).not.toContain("targetPlayerId");
  });

  it("is only available to members, once the game is over", async () => {
    const room = await setup("couple");
    await startAndOpenFirstQuestion(room.id);
    expect(await game.getWrapped(room.id, "host")).toEqual({ ok: false, error: "game_not_finished" });
    await playTo(room.id, ["host", "g1"], () => false);
    expect(await game.getWrapped(room.id, "stranger")).toEqual({ ok: false, error: "not_in_room" });
    const mine = await game.getWrapped(room.id, "g1");
    expect(mine.ok && mine.value.sessionId).toBe((await view(room.id, "g1")).sessionId);
  });

  it("is not in the view before the game is over", async () => {
    const room = await setup("couple");
    await startAndOpenFirstQuestion(room.id);
    expect((await view(room.id, "host")).wrapped).toBeNull();
  });
});

describe("Phase 7: feedback", () => {
  it("only takes feedback from members, once the game is over, one per player", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    expect(await game.submitFeedback(room.id, "g1", { rating: 4 })).toEqual({
      ok: false,
      error: "game_not_finished",
    });

    await playTo(room.id, ["host", "g1"], () => false);
    expect(await game.submitFeedback(room.id, "stranger", { rating: 4 })).toMatchObject({ ok: false });

    expect(await game.submitFeedback(room.id, "g1", { rating: 3 })).toEqual({ ok: true, value: null });
    // Adding a comment later replaces the first rating instead of adding another.
    await game.submitFeedback(room.id, "g1", { rating: 4, comment: "  So   fun!​ " });
    await game.submitFeedback(room.id, "host", { rating: 2, comment: "" });

    const all = await store.listFeedback("2000-01-01T00:00:00Z", 10);
    expect(all).toHaveLength(2);
    expect(all.find((f) => f.rating === 4)).toMatchObject({ mode: "couple", comment: "So fun!" });
    expect(all.find((f) => f.rating === 2)?.comment).toBeNull();
  });
});

describe("Engagement: rematch", () => {
  it("lets only the host send a finished game back to the lobby, once, with fresh questions next time", async () => {
    const room = await setup("couple");
    await game.startGame(room.id, "host");
    expect(await game.rematch(room.id, "host")).toEqual({ ok: false, error: "game_not_finished" });

    await playTo(room.id, ["host", "g1"], () => false);
    const first = (await store.getLatestGame(room.id))!;
    const firstQuestions = first.rounds.flatMap((r) => r.questionIds);

    expect(await game.rematch(room.id, "g1")).toEqual({ ok: false, error: "not_host" });
    expect(await game.rematch(room.id, "stranger")).toMatchObject({ ok: false });

    tick(20 * 60 * 60 * 1000); // late in the room's day: the rematch gets a full day again
    expect(await game.rematch(room.id, "host")).toEqual({ ok: true, value: { reopened: true } });
    const reopened = (await store.getRoomById(room.id))!;
    expect(reopened.status).toBe("LOBBY");
    expect(new Date(reopened.expiresAt).getTime()).toBeGreaterThan(clock.getTime() + 23 * 60 * 60 * 1000);
    // A double tap is harmless.
    expect(await game.rematch(room.id, "host")).toEqual({ ok: true, value: { reopened: false } });

    // Everyone is still in, and game two avoids everything game one showed.
    expect(await game.startGame(room.id, "host")).toMatchObject({ ok: true });
    const second = (await store.getLatestGame(room.id))!;
    expect(second.session.id).not.toBe(first.session.id);
    const repeats = second.rounds.flatMap((r) => r.questionIds).filter((id) => firstQuestions.includes(id));
    expect(repeats).toEqual([]);
  });
});
