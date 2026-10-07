import { describe, expect, it } from "vitest";
import { POINTS, possiblePoints, scoreQuestion } from "@/lib/game/scoring";
import { buildWrapped, pickRoast, ROASTS, type PlayedQuestion, type WrappedInput } from "@/lib/game/wrapped";
import { wrappedHeadline } from "@/lib/game/presentation";
import type { GameType, PlayerAnswer, Question, QuestionCategory, ScoreEntry } from "@/types/game";
import type { Mode } from "@/types/room";

const r = (playerId: string, answer: PlayerAnswer) => ({ playerId, answer });

function q(id: string, gameType: GameType, category: QuestionCategory = "food"): Question {
  return {
    id,
    gameType,
    modes: ["couple", "friends", "circle"],
    category,
    intensity: "safe",
    prompt: gameType === "mind_reader" ? `What would {name} pick? (${id})` : `Prompt ${id}`,
    options: [
      { id: "a", label: `${id}-A` },
      { id: "b", label: `${id}-B` },
      { id: "c", label: `${id}-C` },
    ],
  };
}

/** A played question plus the score entries it locked in, exactly as the service records them. */
function play(
  mode: Mode,
  at: [number, number],
  question: Question,
  responses: PlayedQuestion["responses"],
  subjectPlayerId: string | null = null,
): { played: PlayedQuestion; scores: ScoreEntry[] } {
  const [roundIndex, questionIndex] = at;
  const score = scoreQuestion({ gameType: question.gameType, mode, subjectPlayerId, responses });
  return {
    played: { roundIndex, questionIndex, question, subjectPlayerId, responses },
    scores: [
      ...Object.entries(score.points).map(([playerId, points]) => ({
        playerId,
        roundIndex,
        questionIndex,
        points,
        award: null,
      })),
      ...score.awardWinners.map((playerId) => ({
        playerId,
        roundIndex,
        questionIndex,
        points: 0,
        award: question.award ?? null,
      })),
    ],
  };
}

function input(mode: Mode, plays: Array<ReturnType<typeof play>>, overrides: Partial<WrappedInput> = {}): WrappedInput {
  return {
    sessionId: "session-1",
    mode,
    roomName: null,
    endedEarly: false,
    players:
      mode === "circle"
        ? [
            { id: "lem", nickname: "Lem" },
            { id: "ana", nickname: "Ana" },
            { id: "ben", nickname: "Ben" },
          ]
        : [
            { id: "lem", nickname: "Lem" },
            { id: "ana", nickname: "Ana" },
          ],
    roundTypes:
      mode === "circle"
        ? ["most_likely", "this_or_that", "most_likely"]
        : ["mind_reader", "this_or_that", "most_likely"],
    played: plays.map((p) => p.played),
    scores: plays.flatMap((p) => p.scores),
    ...overrides,
  };
}

describe("possiblePoints", () => {
  const pp = (
    gameType: GameType,
    responses: ReturnType<typeof r>[],
    subject: string | null = null,
    mode: Mode = "couple",
  ) => possiblePoints({ gameType, mode, subjectPlayerId: subject, responses });

  it("matches the points table when everyone answered", () => {
    expect(pp("mind_reader", [r("lem", { optionId: "a" }), r("ana", { optionId: "b" })], "lem")).toBe(
      POINTS.mindReaderCorrect,
    );
    expect(pp("this_or_that", [r("lem", { optionId: "a" }), r("ana", { optionId: "b" })])).toBe(
      2 * POINTS.thisOrThatCorrect,
    );
    expect(pp("most_likely", [r("lem", { targetPlayerId: "x" }), r("ana", { targetPlayerId: "y" })])).toBe(
      2 * POINTS.mostLikelyAgreement,
    );
  });

  it("takes a skipped question out of play instead of counting it against anyone", () => {
    expect(pp("mind_reader", [r("lem", { skipped: true }), r("ana", { optionId: "b" })], "lem")).toBe(0);
    expect(pp("mind_reader", [r("lem", { optionId: "a" }), r("ana", { skipped: true })], "lem")).toBe(0);
    expect(pp("this_or_that", [r("lem", { optionId: "a" }), r("ana", { skipped: true })])).toBe(0);
    expect(pp("most_likely", [r("lem", { targetPlayerId: "x" })])).toBe(0);
  });

  it("is always 0 in Circle, which plays for badges", () => {
    expect(pp("this_or_that", [r("lem", { optionId: "a" }), r("ana", { optionId: "a" })], null, "circle")).toBe(0);
  });
});

describe("buildWrapped: 2-player", () => {
  it("gives a perfect game an Us Score of 100 and names the winner", () => {
    const plays = [
      play("couple", [0, 0], q("m1", "mind_reader"), [r("lem", { optionId: "a" }), r("ana", { optionId: "a" })], "lem"),
      play("couple", [1, 0], q("t1", "this_or_that"), [
        r("lem", { optionId: "a", predictionId: "a" }),
        r("ana", { optionId: "a", predictionId: "a" }),
      ]),
      play("couple", [2, 0], q("w1", "most_likely"), [
        r("lem", { targetPlayerId: "ana" }),
        r("ana", { targetPlayerId: "ana" }),
      ]),
    ];
    const report = buildWrapped(input("couple", plays));
    expect(report.usScore).toBe(100);
    expect(report.winnerIds).toEqual(["ana"]); // 100 + 50 + 75 vs 50 + 75
    expect(report.players.map((p) => [p.nickname, p.points])).toEqual([
      ["Ana", 225],
      ["Lem", 125],
    ]);
    expect(report.rounds).toEqual([
      { gameType: "mind_reader", earned: 100, possible: 100 },
      { gameType: "this_or_that", earned: 100, possible: 100 },
      { gameType: "most_likely", earned: 150, possible: 150 },
    ]);
    expect(report.highlight).toBeNull(); // nobody disagreed
  });

  it("normalizes points earned over points possible, ignoring skipped questions", () => {
    const plays = [
      // Wrong guess: 0 of 100.
      play(
        "couple",
        [0, 0],
        q("m1", "mind_reader", "travel"),
        [r("lem", { optionId: "a" }), r("ana", { optionId: "b" })],
        "lem",
      ),
      // Right guess: 100 of 100.
      play(
        "couple",
        [0, 1],
        q("m2", "mind_reader", "food"),
        [r("ana", { optionId: "c" }), r("lem", { optionId: "c" })],
        "ana",
      ),
      // Subject skipped: out of play.
      play(
        "couple",
        [0, 2],
        q("m3", "mind_reader", "food"),
        [r("lem", { skipped: true }), r("ana", { optionId: "a" })],
        "lem",
      ),
    ];
    const report = buildWrapped(input("couple", plays));
    expect(report.usScore).toBe(50);
    expect(report.rounds).toEqual([{ gameType: "mind_reader", earned: 100, possible: 200 }]);
    // Best category first; a skipped question doesn't create an empty category.
    expect(report.categories).toEqual([
      { category: "food", earned: 100, possible: 100 },
      { category: "travel", earned: 0, possible: 100 },
    ]);
  });

  it("calls a tie when the points are equal", () => {
    const plays = [
      play("couple", [1, 0], q("t1", "this_or_that"), [
        r("lem", { optionId: "a", predictionId: "a" }),
        r("ana", { optionId: "a", predictionId: "a" }),
      ]),
    ];
    const report = buildWrapped(input("couple", plays));
    expect(report.winnerIds).toEqual(["lem", "ana"]);
    expect(wrappedHeadline(report, "lem")).toBe("It's a tie! 🤝");
  });

  it("has no winner or Us Score when the game ended early", () => {
    const plays = [
      play("couple", [0, 0], q("m1", "mind_reader"), [r("lem", { optionId: "a" }), r("ana", { optionId: "a" })], "lem"),
    ];
    const report = buildWrapped(
      input("couple", plays, { endedEarly: true, players: [{ id: "ana", nickname: "Ana" }] }),
    );
    expect(report).toMatchObject({ endedEarly: true, winnerIds: null, usScore: null });
    expect(report.players).toEqual([{ id: "ana", nickname: "Ana", points: 100, awards: [] }]);
    expect(ROASTS.endedEarly).toContain(report.roast);
    expect(wrappedHeadline(report, "ana")).toBe("Game over");
  });

  it("highlights the most surprising disagreement: answers differ, plus each wrong guess", () => {
    const plays = [
      // Mind Reader miss: surprise 2.
      play("couple", [0, 0], q("m1", "mind_reader"), [r("lem", { optionId: "a" }), r("ana", { optionId: "b" })], "lem"),
      // This or That, different picks and both guessed wrong: surprise 3 — the winner.
      play("couple", [1, 0], q("t1", "this_or_that"), [
        r("lem", { optionId: "a", predictionId: "a" }),
        r("ana", { optionId: "b", predictionId: "b" }),
      ]),
      // Who's More Likely disagreement: surprise 1.
      play("couple", [2, 0], q("w1", "most_likely"), [
        r("lem", { targetPlayerId: "ana" }),
        r("ana", { targetPlayerId: "lem" }),
      ]),
    ];
    expect(buildWrapped(input("couple", plays)).highlight).toEqual({
      kind: "disagreement",
      gameType: "this_or_that",
      prompt: "Prompt t1",
      lines: [
        { playerId: "lem", verb: "picked", answer: "t1-A" },
        { playerId: "ana", verb: "picked", answer: "t1-B" },
      ],
    });
  });

  it("shows a Mind Reader miss with the subject's name filled in, and prefers the later question on a tie", () => {
    const plays = [
      play("couple", [0, 0], q("m1", "mind_reader"), [r("lem", { optionId: "a" }), r("ana", { optionId: "b" })], "lem"),
      play("couple", [0, 1], q("m2", "mind_reader"), [r("ana", { optionId: "c" }), r("lem", { optionId: "a" })], "ana"),
    ];
    expect(buildWrapped(input("couple", plays)).highlight).toEqual({
      kind: "disagreement",
      gameType: "mind_reader",
      prompt: "What would Ana pick? (m2)",
      lines: [
        { playerId: "ana", verb: "said", answer: "m2-C" },
        { playerId: "lem", verb: "guessed", answer: "m2-A" },
      ],
    });
  });

  it("names the people picked in a Who's More Likely disagreement", () => {
    const plays = [
      play("friends", [2, 0], q("w1", "most_likely"), [
        r("lem", { targetPlayerId: "ana" }),
        r("ana", { targetPlayerId: "lem" }),
      ]),
    ];
    const highlight = buildWrapped(input("friends", plays)).highlight;
    expect(highlight).toMatchObject({
      lines: [
        { playerId: "lem", answer: "Ana" },
        { playerId: "ana", answer: "Lem" },
      ],
    });
  });

  it("ignores skipped answers when looking for a disagreement", () => {
    const plays = [
      play("couple", [0, 0], q("m1", "mind_reader"), [r("lem", { optionId: "a" }), r("ana", { skipped: true })], "lem"),
    ];
    expect(buildWrapped(input("couple", plays)).highlight).toBeNull();
  });
});

describe("buildWrapped: Circle", () => {
  const ml = (id: string, award: string) => ({ ...q(id, "most_likely"), award });
  const vote = (from: string, to: string) => r(from, { targetPlayerId: to });

  const plays = [
    play("circle", [0, 0], ml("w1", "Future Millionaire 💰"), [
      vote("lem", "ana"),
      vote("ana", "ben"),
      vote("ben", "ana"),
    ]),
    play("circle", [0, 1], ml("w2", "Always Late ⏰"), [vote("lem", "ben"), vote("ana", "ben"), vote("ben", "lem")]),
    // Everyone voted for someone different: no consensus, no badge.
    play("circle", [0, 2], ml("w3", "Debate Champ 🎤"), [vote("lem", "ana"), vote("ana", "ben"), vote("ben", "lem")]),
    play("circle", [1, 0], q("t1", "this_or_that"), [
      r("lem", { optionId: "a" }),
      r("ana", { optionId: "a" }),
      r("ben", { optionId: "a" }),
    ]),
    play("circle", [1, 1], q("t2", "this_or_that"), [
      r("lem", { optionId: "a" }),
      r("ana", { optionId: "b" }),
      r("ben", { optionId: "a" }),
    ]),
  ];

  it("lists the badges per question (only where people agreed), with no points or Us Score", () => {
    const report = buildWrapped(input("circle", plays));
    expect(report.awards).toEqual([
      { label: "Future Millionaire 💰", playerIds: ["ana"] },
      { label: "Always Late ⏰", playerIds: ["ben"] },
    ]);
    expect(report).toMatchObject({ usScore: null, winnerIds: null, rounds: [], categories: [] });
    // Most badges first, then join order; Lem flew under the radar.
    expect(report.players.map((p) => [p.nickname, p.awards])).toEqual([
      ["Ana", ["Future Millionaire 💰"]],
      ["Ben", ["Always Late ⏰"]],
      ["Lem", []],
    ]);
    expect(ROASTS.circle).toContain(report.roast);
    expect(wrappedHeadline(report, "ana")).toBe("That's a wrap!");
  });

  it("highlights the most divided This or That with counts only", () => {
    const report = buildWrapped(input("circle", plays));
    expect(report.highlight).toEqual({
      kind: "split",
      prompt: "Prompt t2",
      counts: [
        { label: "t2-A", count: 2 },
        { label: "t2-B", count: 1 },
        { label: "t2-C", count: 0 },
      ],
    });
  });

  it("never says who voted for whom", () => {
    const report = buildWrapped(input("circle", plays));
    const json = JSON.stringify(report);
    expect(json).not.toContain("targetPlayerId");
    expect(json).not.toContain("optionId");
    // Lem voted for Ana on w1 — nothing in the report ties Lem to that badge.
    expect(report.awards[0].playerIds).not.toContain("lem");
  });

  it("roasts whoever hogged the badges", () => {
    const hog = [
      play("circle", [0, 0], ml("w1", "A"), [vote("lem", "ana"), vote("ben", "ana")]),
      play("circle", [0, 1], ml("w2", "B"), [vote("lem", "ana"), vote("ben", "ana")]),
      play("circle", [0, 2], ml("w3", "C"), [vote("ana", "ben")]),
    ];
    const report = buildWrapped(input("circle", hog));
    expect(report.roast).toContain("Ana");
    expect(report.roast).not.toContain("{name}");
  });
});

describe("pickRoast", () => {
  const base = buildWrapped(input("couple", []));

  it("is deterministic for the same game", () => {
    expect(pickRoast(base)).toBe(pickRoast({ ...base }));
  });

  it("picks from the band that matches the Us Score", () => {
    expect(ROASTS.high).toContain(pickRoast({ ...base, usScore: 92 }));
    expect(ROASTS.good).toContain(pickRoast({ ...base, usScore: 70 }));
    expect(ROASTS.mid).toContain(pickRoast({ ...base, usScore: 40 }));
    expect(ROASTS.low).toContain(pickRoast({ ...base, usScore: 10 }));
    expect(ROASTS.noScore).toContain(pickRoast({ ...base, usScore: null }));
  });

  it("never frames the score as compatibility", () => {
    for (const line of Object.values(ROASTS).flat()) expect(line.toLowerCase()).not.toContain("compatib");
  });
});
