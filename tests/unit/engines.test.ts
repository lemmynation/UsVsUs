import { describe, expect, it } from "vitest";
import { answerOptions, renderPrompt, ROUND_LINEUP, subjectsForRound, validateAnswer } from "@/lib/game/engines";
import type { Question } from "@/types/game";

const tot: Question = {
  id: "tot-x",
  gameType: "this_or_that",
  modes: ["couple", "friends", "circle"],
  category: "food",
  intensity: "safe",
  prompt: "X or Y?",
  options: [
    { id: "a", label: "X" },
    { id: "b", label: "Y" },
  ],
};
const mr: Question = { ...tot, id: "mr-x", gameType: "mind_reader", modes: ["couple"], prompt: "{name}'s pick?" };
const ml: Question = { ...tot, id: "ml-x", gameType: "most_likely", options: [], award: "Badge" };

describe("ROUND_LINEUP", () => {
  it("plays all three games in 2-player modes and no Mind Reader in Circle", () => {
    expect(ROUND_LINEUP.couple).toEqual(["mind_reader", "this_or_that", "most_likely"]);
    expect(ROUND_LINEUP.circle).toEqual(["most_likely", "this_or_that", "most_likely"]);
  });
});

describe("subjectsForRound", () => {
  it("alternates the Mind Reader subject in join order", () => {
    expect(subjectsForRound("mind_reader", 5, ["host", "guest"])).toEqual(["host", "guest", "host", "guest", "host"]);
  });

  it("has no subjects for other games", () => {
    expect(subjectsForRound("this_or_that", 2, ["a", "b"])).toEqual([null, null]);
  });
});

describe("answerOptions / renderPrompt", () => {
  it("makes players the options for Who's More Likely", () => {
    expect(answerOptions(ml, [{ id: "p1", nickname: "Lem" }])).toEqual([{ id: "p1", label: "Lem" }]);
    expect(answerOptions(tot, [])).toBe(tot.options);
  });

  it("fills in the subject's name", () => {
    expect(renderPrompt("{name}'s pick?", "Ana")).toBe("Ana's pick?");
    expect(renderPrompt("{name}'s pick?", null)).toBe("your partner's pick?");
  });
});

describe("validateAnswer", () => {
  const ctx = (question: Question, mode: "couple" | "circle" = "couple") => ({
    question,
    mode,
    activePlayerIds: ["p1", "p2"],
  });

  it("accepts a skip for any game and strips anything else", () => {
    expect(validateAnswer(ctx(tot), { skipped: true, optionId: "a" })).toEqual({ ok: true, value: { skipped: true } });
  });

  it("requires a pick and a prediction for 2-player This or That", () => {
    expect(validateAnswer(ctx(tot), { optionId: "a" }).ok).toBe(false);
    expect(validateAnswer(ctx(tot), { optionId: "a", predictionId: "z" }).ok).toBe(false);
    expect(validateAnswer(ctx(tot), { optionId: "a", predictionId: "b" })).toEqual({
      ok: true,
      value: { optionId: "a", predictionId: "b" },
    });
  });

  it("takes just a pick for Circle This or That, dropping a stray prediction", () => {
    expect(validateAnswer(ctx(tot, "circle"), { optionId: "b", predictionId: "a" })).toEqual({
      ok: true,
      value: { optionId: "b" },
    });
  });

  it("checks Mind Reader options", () => {
    expect(validateAnswer(ctx(mr), { optionId: "a" }).ok).toBe(true);
    expect(validateAnswer(ctx(mr), { optionId: "q" }).ok).toBe(false);
  });

  it("only lets you vote for players still in the room", () => {
    expect(validateAnswer(ctx(ml), { targetPlayerId: "p2" })).toEqual({ ok: true, value: { targetPlayerId: "p2" } });
    expect(validateAnswer(ctx(ml), { targetPlayerId: "gone" }).ok).toBe(false);
    expect(validateAnswer(ctx(ml), { optionId: "a" }).ok).toBe(false);
  });
});
