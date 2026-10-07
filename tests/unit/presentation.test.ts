import { describe, expect, it } from "vitest";
import { revealReaction, tallyAnswers } from "@/lib/game/presentation";

const options = [
  { id: "a", label: "Beach" },
  { id: "b", label: "Mountains" },
];
const react = (mode: "couple" | "friends" | "circle", picks: string[]) =>
  revealReaction(
    mode,
    tallyAnswers(
      options,
      picks.map((optionId, i) => ({ playerId: `p${i}`, optionId })),
    ),
  );

describe("tallyAnswers", () => {
  it("groups players under each option, keeping options with no votes", () => {
    const tally = tallyAnswers(options, [
      { playerId: "x", optionId: "a" },
      { playerId: "y", optionId: "a" },
    ]);
    expect(tally.map((t) => [t.option.id, t.playerIds])).toEqual([
      ["a", ["x", "y"]],
      ["b", []],
    ]);
  });
});

describe("revealReaction", () => {
  it("celebrates a match", () => {
    expect(react("couple", ["a", "a"])).toBe("Same brain! 🧠");
    expect(react("circle", ["b", "b", "b"])).toBe("Total agreement! 🤝");
  });

  it("teases a two-player split", () => {
    expect(react("friends", ["a", "b"])).toBe("Opposites attract 😅");
  });

  it("calls the majority or a tie in a circle", () => {
    expect(react("circle", ["a", "a", "b"])).toBe("Most of you picked Beach");
    expect(react("circle", ["a", "b", "a", "b"])).toBe("Perfect split! ⚖️");
  });

  it("handles thin reveals", () => {
    expect(react("circle", [])).toBe("Nobody answered this one!");
    expect(react("circle", ["a"])).toMatch(/Only one answer/);
  });
});
