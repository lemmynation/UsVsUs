/**
 * The end-of-game Wrapped report (design doc §7, S11). Pure and deterministic:
 * the same finished game always gives the same report, roast line included.
 *
 * Points come from the locked-in score entries, never from raw answers. Answers
 * are only used for what was already shown at each reveal: the points that were
 * possible (for the Us Score) and the highlight. Circle stays anonymous — only
 * badge winners and vote counts, never who voted for whom.
 */
import type {
  GameType,
  PlayerAnswer,
  Question,
  QuestionCategory,
  ScoreEntry,
  WrappedHighlight,
  WrappedReport,
} from "@/types/game";
import type { Mode } from "@/types/room";
import { isTwoPlayer, renderPrompt } from "./engines";
import { possiblePoints, totalPoints } from "./scoring";

export interface PlayedQuestion {
  roundIndex: number;
  questionIndex: number;
  question: Question;
  subjectPlayerId: string | null;
  /** Answers that counted at the reveal (from people still in the room). */
  responses: Array<{ playerId: string; answer: PlayerAnswer }>;
}

export interface WrappedInput {
  sessionId: string;
  mode: Mode;
  roomName: string | null;
  endedEarly: boolean;
  /** People still in the room, in join order. */
  players: Array<{ id: string; nickname: string }>;
  /** Round game types, in order. */
  roundTypes: GameType[];
  /** Questions that reached their reveal, in play order. */
  played: PlayedQuestion[];
  /** Locked-in points and badges for people still in the room. */
  scores: ScoreEntry[];
}

const key = (roundIndex: number, questionIndex: number) => `${roundIndex}.${questionIndex}`;

export function buildWrapped(input: WrappedInput): WrappedReport {
  const twoPlayer = isTwoPlayer(input.mode);
  const nicknameOf = (id: string) => input.players.find((p) => p.id === id)?.nickname ?? "Someone";
  const totals = totalPoints(input.scores);

  const awardsByPlayer = new Map<string, string[]>();
  for (const e of input.scores) {
    if (e.award) awardsByPlayer.set(e.playerId, [...(awardsByPlayer.get(e.playerId) ?? []), e.award]);
  }

  const joinOrder = new Map(input.players.map((p, i) => [p.id, i]));
  const players = input.players
    .map((p) => ({ id: p.id, nickname: p.nickname, points: totals[p.id] ?? 0, awards: awardsByPlayer.get(p.id) ?? [] }))
    .sort((a, b) =>
      twoPlayer
        ? b.points - a.points || joinOrder.get(a.id)! - joinOrder.get(b.id)!
        : b.awards.length - a.awards.length || joinOrder.get(a.id)! - joinOrder.get(b.id)!,
    );

  // Points earned per question (locked in) and possible per question (from who answered).
  const earnedAt = new Map<string, number>();
  for (const e of input.scores)
    earnedAt.set(
      key(e.roundIndex, e.questionIndex),
      (earnedAt.get(key(e.roundIndex, e.questionIndex)) ?? 0) + e.points,
    );

  const rounds: WrappedReport["rounds"] = [];
  const categories = new Map<QuestionCategory, { earned: number; possible: number }>();
  let earnedTotal = 0;
  let possibleTotal = 0;
  if (twoPlayer) {
    input.roundTypes.forEach((gameType, roundIndex) => {
      const inRound = input.played.filter((q) => q.roundIndex === roundIndex);
      if (inRound.length === 0) return;
      const round = { gameType, earned: 0, possible: 0 };
      for (const q of inRound) {
        const possible = possiblePoints({
          gameType: q.question.gameType,
          mode: input.mode,
          subjectPlayerId: q.subjectPlayerId,
          responses: q.responses,
        });
        const earned = Math.min(earnedAt.get(key(q.roundIndex, q.questionIndex)) ?? 0, possible);
        round.earned += earned;
        round.possible += possible;
        if (possible > 0) {
          const c = categories.get(q.question.category) ?? { earned: 0, possible: 0 };
          c.earned += earned;
          c.possible += possible;
          categories.set(q.question.category, c);
        }
      }
      earnedTotal += round.earned;
      possibleTotal += round.possible;
      rounds.push(round);
    });
  }

  let winnerIds: string[] | null = null;
  if (twoPlayer && !input.endedEarly && players.length > 0) {
    winnerIds = players.filter((p) => p.points === players[0].points).map((p) => p.id);
  }
  const usScore =
    twoPlayer && !input.endedEarly && possibleTotal > 0 ? Math.round((earnedTotal / possibleTotal) * 100) : null;

  const awards = twoPlayer ? [] : circleAwards(input.scores);
  const highlight = twoPlayer ? biggestDisagreement(input.played, nicknameOf) : biggestSplit(input.played);

  const report: Omit<WrappedReport, "roast"> = {
    version: 1,
    sessionId: input.sessionId,
    mode: input.mode,
    roomName: input.roomName,
    players,
    endedEarly: input.endedEarly,
    winnerIds,
    usScore,
    rounds,
    categories: [...categories]
      .map(([category, c]) => ({ category, ...c }))
      .sort((a, b) => b.earned / b.possible - a.earned / a.possible || a.category.localeCompare(b.category)),
    awards,
    highlight,
  };
  return { ...report, roast: pickRoast(report) };
}

/** One entry per question that handed out a badge, in play order (ties share it). */
function circleAwards(scores: ScoreEntry[]): WrappedReport["awards"] {
  const byQuestion = new Map<string, { at: [number, number]; label: string; playerIds: string[] }>();
  for (const e of scores) {
    if (!e.award) continue;
    const k = key(e.roundIndex, e.questionIndex);
    const entry = byQuestion.get(k) ?? { at: [e.roundIndex, e.questionIndex], label: e.award, playerIds: [] };
    entry.playerIds.push(e.playerId);
    byQuestion.set(k, entry);
  }
  return [...byQuestion.values()]
    .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1])
    .map(({ label, playerIds }) => ({ label, playerIds: [...playerIds].sort() }));
}

const optionLabel = (q: Question, id: string | undefined) => q.options.find((o) => o.id === id)?.label ?? "?";

/**
 * 2-player: the question where you saw it most differently. Only questions where
 * the answers differ count; each wrong guess on top makes it more surprising.
 * Ties go to the later question (fresher in everyone's mind).
 */
function biggestDisagreement(played: PlayedQuestion[], nicknameOf: (id: string) => string): WrappedHighlight | null {
  let best: { surprise: number; highlight: WrappedHighlight } | null = null;
  for (const q of played) {
    const answered = q.responses.filter((r) => !r.answer.skipped);
    const found = disagreementIn(q, answered, nicknameOf);
    if (found && (!best || found.surprise >= best.surprise)) best = found;
  }
  return best?.highlight ?? null;
}

function disagreementIn(
  q: PlayedQuestion,
  answered: PlayedQuestion["responses"],
  nicknameOf: (id: string) => string,
): { surprise: number; highlight: WrappedHighlight } | null {
  const base = { kind: "disagreement" as const, gameType: q.question.gameType };
  switch (q.question.gameType) {
    case "mind_reader": {
      const subject = answered.find((r) => r.playerId === q.subjectPlayerId);
      const guesser = answered.find((r) => r.playerId !== q.subjectPlayerId);
      if (!subject || !guesser || subject.answer.optionId === guesser.answer.optionId) return null;
      return {
        surprise: 2, // the answers differ and the guess was wrong
        highlight: {
          ...base,
          prompt: renderPrompt(q.question.prompt, nicknameOf(subject.playerId)),
          lines: [
            { playerId: subject.playerId, verb: "said", answer: optionLabel(q.question, subject.answer.optionId) },
            { playerId: guesser.playerId, verb: "guessed", answer: optionLabel(q.question, guesser.answer.optionId) },
          ],
        },
      };
    }
    case "this_or_that": {
      const [a, b] = answered;
      if (!a || !b || a.answer.optionId === b.answer.optionId) return null;
      const wrong =
        Number(a.answer.predictionId !== b.answer.optionId) + Number(b.answer.predictionId !== a.answer.optionId);
      return {
        surprise: 1 + wrong,
        highlight: {
          ...base,
          prompt: q.question.prompt,
          lines: [a, b].map((r) => ({
            playerId: r.playerId,
            verb: "picked" as const,
            answer: optionLabel(q.question, r.answer.optionId),
          })),
        },
      };
    }
    case "most_likely": {
      const [a, b] = answered;
      if (!a || !b || a.answer.targetPlayerId === b.answer.targetPlayerId) return null;
      return {
        surprise: 1,
        highlight: {
          ...base,
          prompt: q.question.prompt,
          lines: [a, b].map((r) => ({
            playerId: r.playerId,
            verb: "picked" as const,
            answer: nicknameOf(r.answer.targetPlayerId!),
          })),
        },
      };
    }
  }
}

/**
 * Circle: the This or That that split the group most evenly (counts only — who
 * picked what stays out of the report). Ties go to more answers, then later.
 */
function biggestSplit(played: PlayedQuestion[]): WrappedHighlight | null {
  let best: { evenness: number; answers: number; highlight: WrappedHighlight } | null = null;
  for (const q of played) {
    if (q.question.gameType !== "this_or_that") continue;
    const answered = q.responses.filter((r) => !r.answer.skipped);
    const counts = q.question.options.map((o) => ({
      label: o.label,
      count: answered.filter((r) => r.answer.optionId === o.id).length,
    }));
    const sorted = counts.map((c) => c.count).sort((x, y) => y - x);
    if (answered.length < 2 || sorted[1] === 0) continue; // everyone agreed: no split
    const evenness = sorted[1] / sorted[0];
    if (!best || evenness > best.evenness || (evenness === best.evenness && answered.length >= best.answers)) {
      best = { evenness, answers: answered.length, highlight: { kind: "split", prompt: q.question.prompt, counts } };
    }
  }
  return best?.highlight ?? null;
}

/**
 * Short reaction lines (design doc §7: deterministic in MVP). Playful, never a
 * claim about the relationship — it's a game score. `{name}` is a player.
 */
export const ROASTS = {
  endedEarly: ["Short and sweet — someone had places to be. 🏃", "Cut short, but the points still count."],
  noScore: ["Mysterious to the end. 🤐", "Lots of skipping. We respect the secrecy. 🤫"],
  high: ["Same brain, two phones. Suspicious. 🧠", "Are you sure you didn't just copy each other? 👀"],
  good: ["Pretty in sync — with just enough chaos to keep it fun. ✨", "You clearly pay attention. Mostly. 😌"],
  mid: ["You know each other… kind of. Rematch recommended. 🔁", "Half mind readers, half total strangers. 🎭"],
  low: ["Strangers who happen to share a Wi-Fi password. 😅", "Bold strategy: guessing at random. Respect. 🎲"],
  circleHog: [
    "{name} carried this whole night. Everyone else: take notes. 👑",
    "Tonight was basically the {name} show. 🎤",
  ],
  circleEveryone: ["Everyone got called out at least once. Fair is fair. ⚖️", "No one escaped tonight. 🔥"],
  circle: [
    "The group chat is going to be busy tonight. 📱",
    "Some reputations were made tonight. Others were ruined. 😈",
  ],
} as const;

/** A stable small hash so the same game always picks the same line. */
function seedOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function pickRoast(report: Omit<WrappedReport, "roast">): string {
  const pick = (lines: readonly string[]) => lines[seedOf(report.sessionId) % lines.length];
  if (report.endedEarly) return pick(ROASTS.endedEarly);

  if (!isTwoPlayer(report.mode)) {
    const badges = report.players.reduce((n, p) => n + p.awards.length, 0);
    const [top] = report.players;
    if (top && badges >= 2 && top.awards.length * 2 > badges) {
      return pick(ROASTS.circleHog).replaceAll("{name}", top.nickname);
    }
    if (badges > 0 && report.players.every((p) => p.awards.length > 0)) return pick(ROASTS.circleEveryone);
    return pick(ROASTS.circle);
  }

  const score = report.usScore;
  if (score === null) return pick(ROASTS.noScore);
  if (score >= 85) return pick(ROASTS.high);
  if (score >= 60) return pick(ROASTS.good);
  if (score >= 35) return pick(ROASTS.mid);
  return pick(ROASTS.low);
}
