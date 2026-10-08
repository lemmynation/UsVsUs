import { describe, expect, it } from "vitest";
import { allAnswered, checkCanAdvance, nextPosition, START_POSITION } from "@/lib/game/state-machine";
import type { GamePosition, GameSession } from "@/types/game";

const COUNTS = [2, 2]; // two rounds of two questions

function walk(from: GamePosition, steps: number): GamePosition[] {
  const out = [from];
  for (let i = 0; i < steps; i++) out.push(nextPosition(out.at(-1)!, COUNTS));
  return out;
}

function session(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: "s1",
    roomId: "r1",
    status: "active",
    packSlug: null,
    ...START_POSITION,
    stateVersion: 3,
    phaseStartedAt: "",
    startedAt: "",
    endedAt: null,
    ...overrides,
  };
}

describe("nextPosition", () => {
  it("walks intro → question → reveal for every question, scoreboard after each round, then finishes", () => {
    const path = walk(START_POSITION, 12).map((p) => `${p.phase}:${p.roundIndex}.${p.questionIndex}`);
    expect(path).toEqual([
      "ROUND_INTRO:0.0",
      "QUESTION_OPEN:0.0",
      "REVEAL:0.0",
      "QUESTION_OPEN:0.1",
      "REVEAL:0.1",
      "SCOREBOARD:0.1",
      "ROUND_INTRO:1.0",
      "QUESTION_OPEN:1.0",
      "REVEAL:1.0",
      "QUESTION_OPEN:1.1",
      "REVEAL:1.1",
      "SCOREBOARD:1.1",
      "FINISHED:1.1",
    ]);
  });

  it("stays finished", () => {
    const done: GamePosition = { phase: "FINISHED", roundIndex: 1, questionIndex: 1 };
    expect(nextPosition(done, COUNTS)).toEqual(done);
  });

  it("handles uneven rounds", () => {
    expect(nextPosition({ phase: "REVEAL", roundIndex: 0, questionIndex: 0 }, [1, 3])).toEqual({
      phase: "SCOREBOARD",
      roundIndex: 0,
      questionIndex: 0,
    });
  });
});

describe("checkCanAdvance", () => {
  it("lets the host advance with the current version", () => {
    expect(checkCanAdvance(session(), true, 3, 0)).toEqual({ ok: true, value: null });
  });

  it("rejects a stale version so a double tap can't skip a step", () => {
    expect(checkCanAdvance(session(), true, 2, 0)).toEqual({ ok: false, error: "stale_state" });
  });

  it("rejects non-hosts", () => {
    expect(checkCanAdvance(session(), false, 3, 0)).toEqual({ ok: false, error: "not_host" });
  });

  it("needs at least one answer before the host can force a reveal", () => {
    const open = session({ phase: "QUESTION_OPEN" });
    expect(checkCanAdvance(open, true, 3, 0)).toEqual({ ok: false, error: "no_answers_yet" });
    expect(checkCanAdvance(open, true, 3, 1).ok).toBe(true);
  });

  it("rejects advancing a finished game", () => {
    expect(checkCanAdvance(session({ phase: "FINISHED" }), true, 3, 0)).toEqual({
      ok: false,
      error: "game_finished",
    });
  });
});

describe("allAnswered", () => {
  it("is true only when every active player has answered", () => {
    expect(allAnswered(["a", "b"], ["a"])).toBe(false);
    expect(allAnswered(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("ignores answers from people who left", () => {
    expect(allAnswered(["a"], ["a", "gone"])).toBe(true);
  });

  it("is never true for an empty room", () => {
    expect(allAnswered([], [])).toBe(false);
  });
});
