import { describe, expect, it } from "vitest";
import { clashSides, formatNames, revealHeadline, roundRules, tallyAnswers } from "@/lib/game/presentation";
import type { PlayerAnswer, QuestionReveal } from "@/types/game";
import type { Mode } from "@/types/room";

const options = [
  { id: "a", label: "Beach" },
  { id: "b", label: "Mountains" },
];
const nameOf = (id: string) => ({ p0: "Lem", p1: "Ana", p2: "Ben" })[id] ?? id;

function reveal(answers: PlayerAnswer[], extra: Partial<QuestionReveal> = {}): QuestionReveal {
  return {
    answers: answers.map((answer, i) => ({ playerId: `p${i}`, answer })),
    votes: null,
    skippedCount: answers.filter((a) => a.skipped).length,
    points: {},
    award: null,
    ...extra,
  };
}
const headline = (gameType: "mind_reader" | "this_or_that" | "most_likely", mode: Mode, r: QuestionReveal) =>
  revealHeadline({ gameType, mode, reveal: r, options, subjectPlayerId: "p0", nameOf });

describe("tallyAnswers", () => {
  it("groups players under each option, skipping skips", () => {
    const tally = tallyAnswers(options, [
      { playerId: "x", answer: { optionId: "a" } },
      { playerId: "y", answer: { optionId: "a" } },
      { playerId: "z", answer: { skipped: true } },
    ]);
    expect(tally.map((t) => [t.option.id, t.playerIds])).toEqual([
      ["a", ["x", "y"]],
      ["b", []],
    ]);
  });
});

describe("revealHeadline", () => {
  it("Mind Reader: hit, miss, or a subject who skipped", () => {
    expect(
      headline("mind_reader", "couple", reveal([{ optionId: "a" }, { optionId: "a" }], { points: { p1: 100 } })),
    ).toBe("Mind reader! 🔮");
    expect(headline("mind_reader", "couple", reveal([{ optionId: "a" }, { optionId: "b" }]))).toBe("Not even close 😅");
    expect(headline("mind_reader", "couple", reveal([{ skipped: true }, { optionId: "b" }]))).toBe(
      "Lem kept it a mystery 🤐",
    );
  });

  it("This or That (2-player): both, one, or neither guessed right", () => {
    const two = [
      { optionId: "a", predictionId: "a" },
      { optionId: "a", predictionId: "a" },
    ];
    expect(headline("this_or_that", "couple", reveal(two, { points: { p0: 50, p1: 50 } }))).toBe(
      "You know each other! 🧠",
    );
    expect(headline("this_or_that", "couple", reveal(two, { points: { p1: 50 } }))).toBe("Ana called it 👀");
    expect(headline("this_or_that", "couple", reveal(two))).toBe("Plot twist! Nobody guessed right 😅");
  });

  it("This or That (Circle): agreement, majority, or a split", () => {
    expect(headline("this_or_that", "circle", reveal([{ optionId: "b" }, { optionId: "b" }]))).toBe(
      "Total agreement! 🤝",
    );
    expect(headline("this_or_that", "circle", reveal([{ optionId: "a" }, { optionId: "a" }, { optionId: "b" }]))).toBe(
      "Most of you picked Beach",
    );
    expect(headline("this_or_that", "circle", reveal([{ optionId: "a" }, { optionId: "b" }]))).toBe(
      "Perfect split! ⚖️",
    );
  });

  it("Who's More Likely: agreement (2-player) and badges (Circle)", () => {
    expect(
      headline(
        "most_likely",
        "friends",
        reveal([{ targetPlayerId: "p1" }, { targetPlayerId: "p1" }], { points: { p0: 75, p1: 75 } }),
      ),
    ).toBe("Great minds! 🤝");
    expect(
      headline(
        "most_likely",
        "circle",
        reveal([], { answers: null, award: { label: "Always Late ⏰", playerIds: ["p1", "p2"] } }),
      ),
    ).toBe("🏆 Always Late ⏰ → Ana & Ben");
    expect(headline("most_likely", "circle", reveal([], { answers: null }))).toBe("Nobody voted on this one!");
    expect(
      headline("most_likely", "circle", reveal([], { answers: null, votes: [{ targetPlayerId: "p1", count: 1 }] })),
    ).toBe("No clear winner — no badge this time 🤷");
  });
});

describe("roundRules", () => {
  it("explains points in 2-player modes and badges in Circle", () => {
    expect(roundRules("this_or_that", "couple")).toMatch(/guess your partner's/);
    expect(roundRules("most_likely", "circle")).toMatch(/anonymous/);
  });
});

describe("formatNames", () => {
  it("joins names naturally", () => {
    expect(formatNames(["Lem"])).toBe("Lem");
    expect(formatNames(["Lem", "Ana"])).toBe("Lem & Ana");
    expect(formatNames(["Lem", "Ana", "Ben"])).toBe("Lem, Ana & Ben");
  });

  it("collapses big ties when asked", () => {
    expect(formatNames(["Lem", "Ana", "Ben", "Cy"], 3)).toBe("4-way tie");
    expect(formatNames(["Lem", "Ana", "Ben"], 3)).toBe("Lem, Ana & Ben");
  });
});

describe("clashSides", () => {
  const players = [
    { id: "p0", nickname: "Lem" },
    { id: "p1", nickname: "Ana" },
    { id: "p2", nickname: "Ben" },
  ];

  it("puts you against your partner in 2-player modes", () => {
    expect(clashSides("couple", players.slice(0, 2), "p0")).toEqual(["You", "Ana"]);
    expect(clashSides("friends", players.slice(0, 2), "p1")).toEqual(["You", "Lem"]);
  });

  it("falls back when the partner has left", () => {
    expect(clashSides("couple", players.slice(0, 1), "p0")).toEqual(["You", "Your partner"]);
  });

  it("puts you against everyone else in a Circle", () => {
    expect(clashSides("circle", players, "p2")).toEqual(["You", "2 others"]);
    expect(clashSides("circle", players.slice(0, 2), "p0")).toEqual(["You", "1 other"]);
  });
});
