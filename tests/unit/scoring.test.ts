import { describe, expect, it } from "vitest";
import { POINTS, scoreQuestion, tallyVotes, totalPoints } from "@/lib/game/scoring";
import type { PlayerAnswer } from "@/types/game";

const r = (playerId: string, answer: PlayerAnswer) => ({ playerId, answer });

describe("Mind Reader", () => {
  const score = (responses: ReturnType<typeof r>[]) =>
    scoreQuestion({ gameType: "mind_reader", mode: "couple", subjectPlayerId: "subject", responses });

  it("gives the predictor 100 for a correct guess, and the subject nothing", () => {
    expect(score([r("subject", { optionId: "b" }), r("guesser", { optionId: "b" })]).points).toEqual({
      guesser: POINTS.mindReaderCorrect,
    });
  });

  it("gives nothing for a wrong guess", () => {
    expect(score([r("subject", { optionId: "b" }), r("guesser", { optionId: "a" })]).points).toEqual({});
  });

  it("gives nothing when the subject skipped or left — there's no truth to guess", () => {
    expect(score([r("subject", { skipped: true }), r("guesser", { optionId: "a" })]).points).toEqual({});
    expect(score([r("guesser", { optionId: "a" })]).points).toEqual({});
  });

  it("gives nothing to a predictor who skipped", () => {
    expect(score([r("subject", { optionId: "a" }), r("guesser", { skipped: true })]).points).toEqual({});
  });
});

describe("This or That", () => {
  const score = (mode: "couple" | "circle", responses: ReturnType<typeof r>[]) =>
    scoreQuestion({ gameType: "this_or_that", mode, subjectPlayerId: null, responses });

  it("gives 50 to each player who predicted their partner's pick", () => {
    const both = score("couple", [
      r("a", { optionId: "x", predictionId: "y" }),
      r("b", { optionId: "y", predictionId: "x" }),
    ]);
    expect(both.points).toEqual({ a: POINTS.thisOrThatCorrect, b: POINTS.thisOrThatCorrect });

    const one = score("couple", [
      r("a", { optionId: "x", predictionId: "y" }),
      r("b", { optionId: "y", predictionId: "y" }),
    ]);
    expect(one.points).toEqual({ a: POINTS.thisOrThatCorrect });
  });

  it("can't score off a partner who skipped", () => {
    expect(score("couple", [r("a", { optionId: "x", predictionId: "y" }), r("b", { skipped: true })]).points).toEqual(
      {},
    );
  });

  it("is a points-free group vote in Circle", () => {
    expect(score("circle", [r("a", { optionId: "x" }), r("b", { optionId: "x" }), r("c", { optionId: "y" })])).toEqual({
      points: {},
      awardWinners: [],
    });
  });
});

describe("Who's More Likely", () => {
  it("gives 75 each when both players pick the same person", () => {
    const s = scoreQuestion({
      gameType: "most_likely",
      mode: "friends",
      subjectPlayerId: null,
      responses: [r("a", { targetPlayerId: "b" }), r("b", { targetPlayerId: "b" })],
    });
    expect(s.points).toEqual({ a: POINTS.mostLikelyAgreement, b: POINTS.mostLikelyAgreement });
  });

  it("gives nothing when they disagree or one skipped", () => {
    const base = { gameType: "most_likely" as const, mode: "couple" as const, subjectPlayerId: null };
    expect(
      scoreQuestion({ ...base, responses: [r("a", { targetPlayerId: "a" }), r("b", { targetPlayerId: "b" })] }).points,
    ).toEqual({});
    expect(
      scoreQuestion({ ...base, responses: [r("a", { targetPlayerId: "a" }), r("b", { skipped: true })] }).points,
    ).toEqual({});
  });

  it("in Circle awards a badge to the most-voted player, no points", () => {
    const s = scoreQuestion({
      gameType: "most_likely",
      mode: "circle",
      subjectPlayerId: null,
      responses: [r("a", { targetPlayerId: "c" }), r("b", { targetPlayerId: "c" }), r("c", { targetPlayerId: "a" })],
    });
    expect(s).toEqual({ points: {}, awardWinners: ["c"] });
  });

  it("shares the badge on a tie, and gives none when nobody voted", () => {
    const base = { gameType: "most_likely" as const, mode: "circle" as const, subjectPlayerId: null };
    const votes = (...targets: string[]) => targets.map((t, i) => r(`v${i}`, { targetPlayerId: t }));
    expect(scoreQuestion({ ...base, responses: votes("a", "a", "b", "b") }).awardWinners.sort()).toEqual(["a", "b"]);
    expect(scoreQuestion({ ...base, responses: [r("a", { skipped: true })] }).awardWinners).toEqual([]);
  });

  it("gives no badge when nobody agreed (every vote went to someone different)", () => {
    const base = { gameType: "most_likely" as const, mode: "circle" as const, subjectPlayerId: null };
    const spread = ["a", "b", "c", "d"].map((t, i) => r(`v${i}`, { targetPlayerId: t }));
    expect(scoreQuestion({ ...base, responses: spread }).awardWinners).toEqual([]);
  });
});

describe("tallyVotes", () => {
  it("counts votes, ignores skips, and orders by count", () => {
    expect(
      tallyVotes([
        { answer: { targetPlayerId: "x" } },
        { answer: { targetPlayerId: "y" } },
        { answer: { targetPlayerId: "y" } },
        { answer: { skipped: true } },
      ]),
    ).toEqual([
      { targetPlayerId: "y", count: 2 },
      { targetPlayerId: "x", count: 1 },
    ]);
  });
});

describe("totalPoints", () => {
  it("sums per player", () => {
    expect(
      totalPoints([
        { playerId: "a", points: 100 },
        { playerId: "a", points: 50 },
        { playerId: "b", points: 75 },
      ]),
    ).toEqual({ a: 150, b: 75 });
  });
});
