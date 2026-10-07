import { describe, expect, it } from "vitest";
import { pickQuestions, planGame, type QuestionHistory } from "@/lib/game/question-picker";
import type { Question, QuestionCategory } from "@/types/game";
import type { Mode } from "@/types/room";

function q(id: string, category: QuestionCategory = "food", modes: Mode[] = ["couple", "friends", "circle"]): Question {
  return {
    id,
    gameType: "this_or_that",
    modes,
    category,
    intensity: "safe",
    prompt: `${id}?`,
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
  };
}

/** Deterministic pseudo-random sequence. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

const pick = (questions: Question[], count: number, history = new Map<string, QuestionHistory>(), seed = 1) =>
  pickQuestions({ questions, mode: "couple", gameType: "this_or_that", count, history, random: seeded(seed) });

describe("pickQuestions", () => {
  it("never repeats a question within a game", () => {
    const bank = Array.from({ length: 20 }, (_, i) => q(`q${i}`));
    const ids = pick(bank, 15).map((x) => x.id);
    expect(new Set(ids).size).toBe(15);
  });

  it("only uses questions for the room's mode", () => {
    const bank = [q("couple", "food", ["couple"]), q("circle", "food", ["circle"])];
    expect(pick(bank, 5).map((x) => x.id)).toEqual(["couple"]);
  });

  it("puts questions nobody has seen ahead of seen ones", () => {
    const bank = ["a", "b", "c", "d"].map((id) => q(id));
    const history = new Map<string, QuestionHistory>([
      ["a", { seenCount: 1, lastSeenAt: "2026-10-01T00:00:00Z" }],
      ["b", { seenCount: 1, lastSeenAt: "2026-10-01T00:00:00Z" }],
    ]);
    expect(
      pick(bank, 2, history)
        .map((x) => x.id)
        .sort(),
    ).toEqual(["c", "d"]);
  });

  it("when everything has been seen, prefers the least-seen, then the longest ago", () => {
    const bank = ["often", "recent", "old"].map((id) => q(id));
    const history = new Map<string, QuestionHistory>([
      ["often", { seenCount: 5, lastSeenAt: "2026-01-01T00:00:00Z" }],
      ["recent", { seenCount: 1, lastSeenAt: "2026-10-06T00:00:00Z" }],
      ["old", { seenCount: 1, lastSeenAt: "2026-09-01T00:00:00Z" }],
    ]);
    expect(pick(bank, 3, history).map((x) => x.id)).toEqual(["old", "recent", "often"]);
  });

  it("avoids back-to-back questions from the same category when it can", () => {
    const bank = [q("f1", "food"), q("f2", "food"), q("f3", "food"), q("t1", "travel"), q("t2", "travel")];
    const cats = pick(bank, 5).map((x) => x.category);
    const backToBack = cats.filter((c, i) => i > 0 && c === cats[i - 1]).length;
    expect(backToBack).toBeLessThanOrEqual(1); // 3 food + 2 travel: at most one unavoidable pair
  });

  it("varies the order between games", () => {
    const bank = Array.from({ length: 30 }, (_, i) => q(`q${i}`, i % 2 ? "food" : "travel"));
    expect(pick(bank, 10, undefined, 1).map((x) => x.id)).not.toEqual(pick(bank, 10, undefined, 2).map((x) => x.id));
  });

  it("never picks deactivated questions for a new game", () => {
    const bank = [q("on"), { ...q("off"), active: false }];
    expect(pick(bank, 5).map((x) => x.id)).toEqual(["on"]);
  });

  it("returns fewer when the bank is small rather than repeating", () => {
    expect(pick([q("only")], 15)).toHaveLength(1);
  });
});

describe("planGame", () => {
  const bank = [
    ...Array.from({ length: 12 }, (_, i) => q(`tot${i}`)),
    ...Array.from({ length: 12 }, (_, i) => ({ ...q(`ml${i}`), gameType: "most_likely" as const, options: [] })),
  ];
  const plan = (lineup: Array<"this_or_that" | "most_likely" | "mind_reader">, perRound = 5) =>
    planGame({ questions: bank, mode: "circle", lineup, perRound, history: new Map(), random: seeded(3) });

  it("fills each round with its own game type", () => {
    const p = plan(["most_likely", "this_or_that", "most_likely"]);
    expect(p.map((r) => r.gameType)).toEqual(["most_likely", "this_or_that", "most_likely"]);
    expect(p.every((r) => r.questionIds.length === 5)).toBe(true);
  });

  it("never repeats a question across two rounds of the same type", () => {
    const ids = plan(["most_likely", "this_or_that", "most_likely"]).flatMap((r) => r.questionIds);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shortens or drops rounds rather than repeating when a type runs low", () => {
    const p = plan(["most_likely", "most_likely", "most_likely"]); // 12 questions for 15 slots
    expect(p.map((r) => r.questionIds.length)).toEqual([5, 5, 2]);
    expect(plan(["mind_reader", "this_or_that"]).map((r) => r.gameType)).toEqual(["this_or_that"]);
  });
});
