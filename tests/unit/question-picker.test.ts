import { describe, expect, it } from "vitest";
import { pickQuestions, planRounds, type QuestionHistory } from "@/lib/game/question-picker";
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

describe("planRounds", () => {
  it("splits picks into rounds", () => {
    const qs = Array.from({ length: 15 }, (_, i) => q(`q${i}`));
    const plan = planRounds(qs, 3, 5);
    expect(plan).toHaveLength(3);
    expect(plan.every((r) => r.questionIds.length === 5)).toBe(true);
    expect(new Set(plan.flatMap((r) => r.questionIds)).size).toBe(15);
  });

  it("makes fewer, shorter rounds when there aren't enough questions", () => {
    const plan = planRounds([q("a"), q("b"), q("c"), q("d"), q("e"), q("f"), q("g")], 3, 5);
    expect(plan.map((r) => r.questionIds.length)).toEqual([5, 2]);
  });
});
