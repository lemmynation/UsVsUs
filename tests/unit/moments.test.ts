import { describe, expect, it } from "vitest";
import { leaderOf, revealMoments, type RevealPosition } from "@/lib/game/moments";
import type { ScoreEntry } from "@/types/game";

const pos = (questionIndex: number, subjectPlayerId: string | null = null, roundIndex = 0): RevealPosition => ({
  roundIndex,
  questionIndex,
  subjectPlayerId,
});
const score = (playerId: string, p: RevealPosition, points: number): ScoreEntry => ({
  playerId,
  roundIndex: p.roundIndex,
  questionIndex: p.questionIndex,
  points,
  award: null,
});

const players = ["lem", "ana"];
const moments = (scores: ScoreEntry[], revealed: RevealPosition[], meId = "ana", trackLeader = true) =>
  revealMoments({ scores, revealed, meId, playerIds: players, trackLeader });

describe("streaks", () => {
  it("counts reveals in a row the player scored on, ending with this one", () => {
    const qs = [pos(0), pos(1), pos(2), pos(3)];
    const scores = [score("ana", qs[1], 100), score("ana", qs[2], 100), score("ana", qs[3], 50)];
    expect(moments(scores, qs).streak).toBe(3);
    expect(moments(scores, qs.slice(0, 1)).streak).toBe(0); // missed the first
  });

  it("doesn't let a question about you (you can't score on it) break the streak", () => {
    const qs = [pos(0), pos(1, "ana"), pos(2), pos(3, "ana"), pos(4)];
    const scores = [score("ana", qs[0], 100), score("ana", qs[2], 100), score("ana", qs[4], 100)];
    expect(moments(scores, qs).streak).toBe(3);
    // On the reveal about you there's no streak callout at all.
    expect(moments(scores, qs.slice(0, 4)).streak).toBe(0);
  });

  it("carries across rounds", () => {
    const qs = [pos(4, null, 0), pos(0, null, 1)];
    expect(moments([score("ana", qs[0], 100), score("ana", qs[1], 100)], qs).streak).toBe(2);
  });
});

describe("lead changes", () => {
  it("announces the first lead and each change, but not holding the lead", () => {
    const qs = [pos(0), pos(1), pos(2)];
    const scores = [score("lem", qs[0], 100), score("lem", qs[1], 0), score("ana", qs[2], 250)];
    expect(moments(scores, qs.slice(0, 1))).toMatchObject({ newLeaderId: "lem", firstLead: true });
    expect(moments(scores, qs.slice(0, 2))).toMatchObject({ newLeaderId: null });
    expect(moments(scores, qs)).toMatchObject({ newLeaderId: "ana", firstLead: false });
  });

  it("treats a tie at the top as nobody leading", () => {
    expect(
      leaderOf(
        new Map([
          ["lem", 100],
          ["ana", 100],
        ]),
      ),
    ).toBeNull();
    expect(
      leaderOf(
        new Map([
          ["lem", 0],
          ["ana", 0],
        ]),
      ),
    ).toBeNull();
    const qs = [pos(0), pos(1)];
    // Lem led, Ana catches up to a tie: no new leader to announce.
    const tie = [score("lem", qs[0], 100), score("ana", qs[1], 100)];
    expect(moments(tie, qs).newLeaderId).toBeNull();
  });

  it("ignores players who left, and stays quiet in Circle", () => {
    const qs = [pos(0)];
    expect(moments([score("gone", qs[0], 500)], qs).newLeaderId).toBeNull();
    expect(moments([score("ana", qs[0], 100)], qs, "ana", false).newLeaderId).toBeNull();
  });
});
