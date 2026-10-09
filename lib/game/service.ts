import type {
  GamePosition,
  GameResponse,
  GameRound,
  GameSession,
  GameView,
  PlayerAnswer,
  Question,
  ScoreEntry,
  WrappedReport,
} from "@/types/game";
import type { Player, Room } from "@/types/room";
import { loadMembership, type MembershipError } from "@/lib/rooms/membership";
import {
  activePlayers,
  checkCanStart,
  isOnline,
  MODE_RULES,
  sanitizeFeedbackComment,
  type Result,
  type StartError,
} from "@/lib/rooms/rules";
import type { FeedbackRating, RoomStore } from "@/lib/rooms/store";
import { findPack } from "@/lib/premium/catalog";
import {
  answerOptions,
  isTwoPlayer,
  PREMIUM_LINEUP,
  renderPrompt,
  ROUND_LINEUP,
  subjectsForRound,
  validateAnswer,
} from "./engines";
import { planGame } from "./question-picker";
import { scoreQuestion, tallyVotes, totalPoints } from "./scoring";
import {
  allAnswered,
  checkCanAdvance,
  GAME_CONFIG,
  isQuestionPhase,
  nextPosition,
  type AdvanceError,
} from "./state-machine";
import { buildWrapped, type PlayedQuestion } from "./wrapped";

export interface GameServiceDeps {
  store: RoomStore;
  now: () => Date;
  random: () => number;
  /** Called when the service changes a room on its own (e.g. passing host), so clients can be pinged. */
  onRoomChanged?: (roomId: string) => Promise<void>;
}

export type StartGameError = MembershipError | StartError | "no_questions" | "pack_locked" | "pack_not_found";
export type AnswerError = MembershipError | "not_open" | "invalid_answer";
export type GameAdvanceError = MembershipError | AdvanceError | "not_open";
export type WrappedError = MembershipError | "game_not_finished";

const ok = <T>(value: T) => ({ ok: true, value }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

type Game = { session: GameSession; rounds: GameRound[] };
type Current = { round: GameRound; questionId: string; subjectPlayerId: string | null };

const questionCounts = (game: Game) => game.rounds.map((r) => r.questionIds.length);
const byJoinOrder = (players: Player[]) => [...players].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));

function currentQuestion(game: Game): Current | null {
  const round = game.rounds[game.session.roundIndex];
  const questionId = round?.questionIds[game.session.questionIndex];
  if (!round || !questionId) return null;
  return { round, questionId, subjectPlayerId: round.subjectPlayerIds[game.session.questionIndex] ?? null };
}

/** Responses from people still in the room (a removed player's answer no longer counts). */
function stillHere(responses: GameResponse[], players: Player[]) {
  const ids = new Set(activePlayers(players).map((p) => p.id));
  return responses.filter((r) => ids.has(r.playerId));
}

/**
 * Responses that count toward a reveal and its points: from people still here,
 * and a vote for someone who has since left counts as no vote (so a badge can't
 * go to a player who isn't in the room).
 */
function countable(responses: GameResponse[], players: Player[]) {
  const ids = new Set(activePlayers(players).map((p) => p.id));
  return stillHere(responses, players).map((r) =>
    r.answer.targetPlayerId && !ids.has(r.answer.targetPlayerId) ? { ...r, answer: { skipped: true as const } } : r,
  );
}

/** A game needs at least two people; below that there's nothing to guess or vote on. */
const MIN_PLAYERS_TO_CONTINUE = 2;

export function createGameService({ store, now, random, onRoomChanged }: GameServiceDeps) {
  async function findQuestion(id: string): Promise<Question | undefined> {
    return (await store.getQuestions()).find((q) => q.id === id);
  }

  /**
   * Scores the question the game is revealing and locks the points in. Safe to
   * call more than once: answers can't change after the reveal, and the store
   * ignores entries it already has.
   */
  async function lockInScores(game: Game, room: Room, players: Player[]) {
    const current = currentQuestion(game);
    if (!current) return;
    const question = await findQuestion(current.questionId);
    if (!question) return;
    const responses = countable(await store.listResponses(current.round.id, current.questionId), players);
    const score = scoreQuestion({
      gameType: question.gameType,
      mode: room.mode,
      subjectPlayerId: current.subjectPlayerId,
      responses,
    });
    const at = { roundIndex: game.session.roundIndex, questionIndex: game.session.questionIndex };
    const entries: ScoreEntry[] = [
      ...Object.entries(score.points).map(([playerId, points]) => ({ playerId, ...at, points, award: null })),
      ...score.awardWinners.map((playerId) => ({ playerId, ...at, points: 0, award: question.award ?? null })),
    ];
    await store.recordScores(game.session.id, entries);
  }

  /**
   * The game's Wrapped report: the saved one, or built from the finished game
   * and saved now (first save wins, so racing requests agree). Built eagerly when
   * the game finishes; building here too covers an interrupted finish.
   */
  async function wrappedFor(
    game: Game,
    room: Room,
    players: Player[],
    /** Whether the question the game stopped on had been revealed. Unknown → assume a normal finish. */
    stoppedAfterReveal?: boolean,
  ): Promise<WrappedReport> {
    const { session, rounds } = game;
    const saved = await store.getWrapped(session.id);
    if (saved) return saved;

    const active = byJoinOrder(activePlayers(players));
    const activeIds = new Set(active.map((p) => p.id));
    const endedEarly = active.length < MIN_PLAYERS_TO_CONTINUE;
    const [questions, responses, scores] = await Promise.all([
      store.getQuestions(),
      store.listSessionResponses(session.id),
      store.listScores(session.id),
    ]);

    // Everything before where the game stopped was revealed. A normal finish stops
    // on the last question, after its reveal; an early one may stop mid-question
    // (not revealed) or during a reveal (revealed).
    const includeStopQuestion = stoppedAfterReveal ?? !endedEarly;
    const played: PlayedQuestion[] = [];
    for (const round of rounds) {
      round.questionIds.forEach((questionId, questionIndex) => {
        const here = round.roundIndex === session.roundIndex && questionIndex === session.questionIndex;
        const before =
          round.roundIndex < session.roundIndex ||
          (round.roundIndex === session.roundIndex && questionIndex < session.questionIndex);
        const question = questions.find((q) => q.id === questionId);
        if (!question || !(before || (here && includeStopQuestion))) return;
        played.push({
          roundIndex: round.roundIndex,
          questionIndex,
          question,
          subjectPlayerId: round.subjectPlayerIds[questionIndex] ?? null,
          responses: countable(
            responses.filter((r) => r.roundId === round.id && r.questionId === questionId),
            players,
          ),
        });
      });
    }

    const report = buildWrapped({
      sessionId: session.id,
      mode: room.mode,
      roomName: room.name,
      endedEarly,
      players: active.map((p) => ({ id: p.id, nickname: p.nickname })),
      roundTypes: rounds.map((r) => r.gameType),
      played,
      scores: scores.filter((e) => activeIds.has(e.playerId)),
    });
    return store.saveWrapped(session.id, report, now().toISOString());
  }

  /** Moves the game and does the bookkeeping that goes with a transition. */
  async function moveTo(game: Game, room: Room, players: Player[], next: GamePosition): Promise<GameSession | "stale"> {
    // Leaving a reveal: make sure its points were recorded (covers an interrupted earlier attempt).
    if (game.session.phase === "REVEAL") await lockInScores(game, room, players);

    const at = now().toISOString();
    const moved = await store.advanceGame({
      sessionId: game.session.id,
      expectedVersion: game.session.stateVersion,
      next,
      now: at,
    });
    if (moved !== "stale" && next.phase === "REVEAL") {
      // Answers are final now (the store refuses answers once the reveal is in).
      const revealed = { ...game, session: moved };
      await lockInScores(revealed, room, players);
      const current = currentQuestion(revealed);
      if (current) {
        const hashes = activePlayers(players).map((p) => p.sessionTokenHash);
        await store.recordQuestionSeen(hashes, current.questionId, at);
      }
    }
    // Freeze the report now, while everyone who finished is still in the room.
    if (moved !== "stale" && next.phase === "FINISHED") {
      const after = game.session.phase === "REVEAL" || game.session.phase === "SCOREBOARD";
      await wrappedFor({ ...game, session: moved }, room, players, after);
    }
    return moved;
  }

  async function revealIfEveryoneAnswered(game: Game, room: Room, players: Player[]): Promise<boolean> {
    if (game.session.phase !== "QUESTION_OPEN") return false;
    const current = currentQuestion(game);
    if (!current) return false;
    const responses = await store.listResponses(current.round.id, current.questionId);
    const active = activePlayers(players).map((p) => p.id);
    if (
      !allAnswered(
        active,
        responses.map((r) => r.playerId),
      )
    )
      return false;
    // Another request may win the race; either way the question is revealed.
    await moveTo(game, room, players, nextPosition(game.session, questionCounts(game)));
    return true;
  }

  return {
    async startGame(
      roomId: string,
      sessionHash: string,
      options: { packSlug?: string } = {},
    ): Promise<Result<{ sessionId: string }, StartGameError>> {
      const membership = await loadMembership(store, roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, players, me } = membership.value;

      const check = checkCanStart(room, players, me, now());
      if (!check.ok) return check;

      const pack = options.packSlug ? findPack(options.packSlug) : undefined;
      if (options.packSlug && (!pack || !pack.modes.includes(room.mode))) return fail("pack_not_found");

      const active = byJoinOrder(activePlayers(players));
      const [questions, history] = await Promise.all([
        store.getQuestions(),
        store.getQuestionHistory(active.map((p) => p.sessionTokenHash)),
      ]);
      const plan = planGame({
        questions,
        mode: room.mode,
        lineup: pack ? PREMIUM_LINEUP[room.mode] : ROUND_LINEUP[room.mode],
        perRound: pack ? GAME_CONFIG.premiumQuestionsPerRound : GAME_CONFIG.questionsPerRound,
        history,
        random,
        pack: pack?.slug,
      });
      if (plan.length === 0) return fail("no_questions");

      const started = await store.startGame({
        roomId: room.id,
        minPlayers: MODE_RULES[room.mode].minPlayers,
        rounds: plan.map((r) => ({
          ...r,
          subjectPlayerIds: subjectsForRound(
            r.gameType,
            r.questionIds.length,
            active.map((p) => p.id),
          ),
        })),
        now: now().toISOString(),
        packSlug: pack?.slug,
      });
      if (typeof started === "string") return fail(started);
      return ok({ sessionId: started.session.id });
    },

    /** Locks in the caller's answer. Reveals automatically once everyone still here has answered. */
    async submitAnswer(
      roomId: string,
      sessionHash: string,
      input: { questionId: string; answer: PlayerAnswer },
    ): Promise<Result<{ duplicate: boolean; revealed: boolean }, AnswerError>> {
      const membership = await loadMembership(store, roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, players, me } = membership.value;

      const game = await store.getLatestGame(roomId);
      const current = game && currentQuestion(game);
      if (!game || !current || game.session.phase !== "QUESTION_OPEN" || current.questionId !== input.questionId) {
        return fail("not_open");
      }
      const question = await findQuestion(current.questionId);
      if (!question) return fail("not_open");
      const answer = validateAnswer(
        { question, mode: room.mode, activePlayerIds: activePlayers(players).map((p) => p.id) },
        input.answer,
      );
      if (!answer.ok) return answer;

      const submitted = await store.submitResponse({
        sessionId: game.session.id,
        roundId: current.round.id,
        roundIndex: game.session.roundIndex,
        questionIndex: game.session.questionIndex,
        questionId: current.questionId,
        playerId: me.id,
        answer: answer.value,
        now: now().toISOString(),
      });
      if (submitted === "not_open") return fail("not_open");

      const revealed = await revealIfEveryoneAnswered(game, room, players);
      return ok({ duplicate: submitted === "duplicate", revealed });
    },

    /** Host moves the game on. `expectedVersion` makes double taps and racing hosts harmless. */
    async advance(
      roomId: string,
      sessionHash: string,
      expectedVersion: number,
    ): Promise<Result<{ stateVersion: number; finished: boolean }, GameAdvanceError>> {
      const membership = await loadMembership(store, roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, players, me } = membership.value;

      const game = await store.getLatestGame(roomId);
      if (!game) return fail("not_open");

      let answers = 0;
      const current = currentQuestion(game);
      if (game.session.phase === "QUESTION_OPEN" && current) {
        answers = stillHere(await store.listResponses(current.round.id, current.questionId), players).length;
      }
      const isHost = me.isHost && room.hostPlayerId === me.id;
      const check = checkCanAdvance(game.session, isHost, expectedVersion, answers);
      if (!check.ok) return check;

      const moved = await moveTo(game, room, players, nextPosition(game.session, questionCounts(game)));
      if (moved === "stale") return fail("stale_state");
      return ok({ stateVersion: moved.stateVersion, finished: moved.phase === "FINISHED" });
    },

    /** The finished game's Wrapped report, for a member of the room (the share image). */
    async getWrapped(roomId: string, sessionHash: string): Promise<Result<WrappedReport, WrappedError>> {
      const membership = await loadMembership(store, roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, players } = membership.value;
      const game = await store.getLatestGame(roomId);
      if (!game || game.session.phase !== "FINISHED") return fail("game_not_finished");
      return ok(await wrappedFor(game, room, players));
    },

    /** A player's rating of the game they just finished; sending again replaces it. */
    async submitFeedback(
      roomId: string,
      sessionHash: string,
      input: { rating: FeedbackRating; comment?: string | null },
    ): Promise<Result<null, WrappedError>> {
      const membership = await loadMembership(store, roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, me } = membership.value;
      const game = await store.getLatestGame(roomId);
      if (!game || game.session.phase !== "FINISHED") return fail("game_not_finished");
      await store.saveFeedback({
        roomId,
        sessionId: game.session.id,
        playerId: me.id,
        mode: room.mode,
        rating: input.rating,
        comment: sanitizeFeedbackComment(input.comment),
        now: now().toISOString(),
      });
      return ok(null);
    },

    /** After someone leaves or is removed, the people left may all have answered already. */
    async afterRosterChange(roomId: string): Promise<boolean> {
      const [game, room] = await Promise.all([store.getLatestGame(roomId), store.getRoomById(roomId)]);
      if (!game || !room || game.session.phase === "FINISHED") return false;
      const players = await store.listPlayers(roomId);

      // Down to one player mid-game: end it now (points already earned are kept).
      if (room.status === "IN_GAME" && activePlayers(players).length < MIN_PLAYERS_TO_CONTINUE) {
        const last = { ...game.session, phase: "FINISHED" as const };
        return (await moveTo(game, room, players, last)) !== "stale";
      }
      return revealIfEveryoneAnswered(game, room, players);
    },

    /**
     * Mid-game, a host who's been gone for a minute hands control to the
     * earliest-joined player who is still here, so the room never gets stuck.
     */
    async passHostIfAway(room: Room, players: Player[]): Promise<boolean> {
      if (room.status !== "IN_GAME" || !room.hostPlayerId) return false;
      const at = now();
      const host = players.find((p) => p.id === room.hostPlayerId);
      if (!host || at.getTime() - new Date(host.lastSeenAt).getTime() < GAME_CONFIG.hostAwayMs) return false;

      const successor = byJoinOrder(activePlayers(players)).find((p) => p.id !== host.id && isOnline(p, at));
      if (!successor) return false;

      const passed = await store.transferHost(room.id, host.id, successor.id);
      if (passed) await onRoomChanged?.(room.id);
      return passed;
    },

    /**
     * The game from one player's point of view. Others' answers only appear once
     * revealed, and Circle's Who's More Likely votes are only ever shown as counts.
     */
    async viewFor(room: Room, players: Player[], me: Player): Promise<GameView | null> {
      const game = await store.getLatestGame(room.id);
      if (!game) return null;
      const { session, rounds } = game;
      const round = rounds[session.roundIndex];
      const active = byJoinOrder(activePlayers(players));
      const activeIds = new Set(active.map((p) => p.id));
      const twoPlayer = isTwoPlayer(room.mode);

      let question: GameView["question"] = null;
      let myRole: GameView["myRole"] = null;
      let answeredPlayerIds: string[] = [];
      let myAnswer: PlayerAnswer | null = null;
      let reveal: GameView["reveal"] = null;

      const current = currentQuestion(game);
      const found = current && isQuestionPhase(session.phase) ? await findQuestion(current.questionId) : undefined;
      if (current && found) {
        const subject = players.find((p) => p.id === current.subjectPlayerId) ?? null;
        question = {
          id: found.id,
          prompt: renderPrompt(found.prompt, subject?.nickname ?? null),
          options: answerOptions(found, active),
          subjectPlayerId: current.subjectPlayerId,
        };
        myRole =
          found.gameType === "mind_reader" ? (current.subjectPlayerId === me.id ? "subject" : "predictor") : "player";

        const responses = stillHere(await store.listResponses(current.round.id, current.questionId), players);
        answeredPlayerIds = responses.map((r) => r.playerId);
        myAnswer = responses.find((r) => r.playerId === me.id)?.answer ?? null;

        if (session.phase === "REVEAL") {
          const counted = countable(responses, players);
          const score = scoreQuestion({
            gameType: found.gameType,
            mode: room.mode,
            subjectPlayerId: current.subjectPlayerId,
            responses: counted,
          });
          const anonymous = found.gameType === "most_likely" && !twoPlayer;
          reveal = {
            answers: anonymous ? null : counted.map((r) => ({ playerId: r.playerId, answer: r.answer })),
            votes: anonymous ? tallyVotes(counted) : null,
            skippedCount: counted.filter((r) => r.answer.skipped).length,
            points: score.points,
            award:
              anonymous && score.awardWinners.length > 0 && found.award
                ? { label: found.award, playerIds: score.awardWinners }
                : null,
          };
        }
      }

      const entries = (await store.listScores(session.id)).filter((e) => activeIds.has(e.playerId));
      const totals = totalPoints(entries);
      const thisRound = totalPoints(entries.filter((e) => e.roundIndex === session.roundIndex));

      return {
        sessionId: session.id,
        phase: session.phase,
        stateVersion: session.stateVersion,
        gameType: round?.gameType ?? "this_or_that",
        roundIndex: session.roundIndex,
        roundCount: rounds.length,
        questionIndex: session.questionIndex,
        questionCount: round?.questionIds.length ?? 0,
        question,
        myRole,
        answeredPlayerIds,
        myAnswer,
        reveal,
        standings: twoPlayer
          ? active.map((p) => ({ playerId: p.id, points: totals[p.id] ?? 0 })).sort((a, b) => b.points - a.points)
          : [],
        roundPoints: thisRound,
        awards: entries.filter((e) => e.award).map((e) => ({ label: e.award!, playerId: e.playerId })),
        wrapped: session.phase === "FINISHED" ? await wrappedFor(game, room, players) : null,
        packSlug: session.packSlug,
      };
    },
  };
}

export type GameService = ReturnType<typeof createGameService>;
