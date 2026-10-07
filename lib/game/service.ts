import type { GamePosition, GameRound, GameSession, GameView } from "@/types/game";
import type { Player, Room } from "@/types/room";
import { loadMembership, type MembershipError } from "@/lib/rooms/membership";
import { activePlayers, checkCanStart, isOnline, MODE_RULES, type Result, type StartError } from "@/lib/rooms/rules";
import type { RoomStore } from "@/lib/rooms/store";
import { pickQuestions, planRounds } from "./question-picker";
import {
  allAnswered,
  checkCanAdvance,
  GAME_CONFIG,
  isQuestionPhase,
  nextPosition,
  type AdvanceError,
} from "./state-machine";

export interface GameServiceDeps {
  store: RoomStore;
  now: () => Date;
  random: () => number;
  /** Called when the service changes a room on its own (e.g. passing host), so clients can be pinged. */
  onRoomChanged?: (roomId: string) => Promise<void>;
}

export type StartGameError = MembershipError | StartError | "no_questions";
export type AnswerError = MembershipError | "not_open" | "invalid_answer";
export type GameAdvanceError = MembershipError | AdvanceError | "not_open";

const ok = <T>(value: T) => ({ ok: true, value }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

type Game = { session: GameSession; rounds: GameRound[] };

const questionCounts = (game: Game) => game.rounds.map((r) => r.questionIds.length);

function currentQuestionId(game: Game): { round: GameRound; questionId: string } | null {
  const round = game.rounds[game.session.roundIndex];
  const questionId = round?.questionIds[game.session.questionIndex];
  return round && questionId ? { round, questionId } : null;
}

export function createGameService({ store, now, random, onRoomChanged }: GameServiceDeps) {
  /** Moves the game and does the bookkeeping that goes with a transition. */
  async function moveTo(game: Game, players: Player[], next: GamePosition): Promise<GameSession | "stale"> {
    const at = now().toISOString();
    const moved = await store.advanceGame({
      sessionId: game.session.id,
      expectedVersion: game.session.stateVersion,
      next,
      now: at,
    });
    if (moved !== "stale" && next.phase === "REVEAL") {
      const current = currentQuestionId({ ...game, session: moved });
      if (current) {
        const hashes = activePlayers(players).map((p) => p.sessionTokenHash);
        await store.recordQuestionSeen(hashes, current.questionId, at);
      }
    }
    return moved;
  }

  async function revealIfEveryoneAnswered(game: Game, players: Player[]): Promise<boolean> {
    if (game.session.phase !== "QUESTION_OPEN") return false;
    const current = currentQuestionId(game);
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
    await moveTo(game, players, nextPosition(game.session, questionCounts(game)));
    return true;
  }

  return {
    async startGame(roomId: string, sessionHash: string): Promise<Result<{ sessionId: string }, StartGameError>> {
      const membership = await loadMembership(store, roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, players, me } = membership.value;

      const check = checkCanStart(room, players, me, now());
      if (!check.ok) return check;

      const active = activePlayers(players);
      const [questions, history] = await Promise.all([
        store.getQuestions(),
        store.getQuestionHistory(active.map((p) => p.sessionTokenHash)),
      ]);
      const picked = pickQuestions({
        questions,
        mode: room.mode,
        gameType: "this_or_that",
        count: GAME_CONFIG.rounds * GAME_CONFIG.questionsPerRound,
        history,
        random,
      });
      if (picked.length === 0) return fail("no_questions");

      const started = await store.startGame({
        roomId: room.id,
        minPlayers: MODE_RULES[room.mode].minPlayers,
        rounds: planRounds(picked, GAME_CONFIG.rounds, GAME_CONFIG.questionsPerRound),
        now: now().toISOString(),
      });
      if (typeof started === "string") return fail(started);
      return ok({ sessionId: started.session.id });
    },

    /** Locks in the caller's answer. Reveals automatically once everyone still here has answered. */
    async submitAnswer(
      roomId: string,
      sessionHash: string,
      input: { questionId: string; optionId: string },
    ): Promise<Result<{ duplicate: boolean; revealed: boolean }, AnswerError>> {
      const membership = await loadMembership(store, roomId, sessionHash);
      if (!membership.ok) return membership;
      const { players, me } = membership.value;

      const game = await store.getLatestGame(roomId);
      const current = game && currentQuestionId(game);
      if (!game || !current || game.session.phase !== "QUESTION_OPEN" || current.questionId !== input.questionId) {
        return fail("not_open");
      }
      const question = (await store.getQuestions()).find((q) => q.id === current.questionId);
      if (!question?.options.some((o) => o.id === input.optionId)) return fail("invalid_answer");

      const submitted = await store.submitResponse({
        sessionId: game.session.id,
        roundId: current.round.id,
        roundIndex: game.session.roundIndex,
        questionIndex: game.session.questionIndex,
        questionId: current.questionId,
        playerId: me.id,
        answer: { optionId: input.optionId },
        now: now().toISOString(),
      });
      if (submitted === "not_open") return fail("not_open");

      const revealed = await revealIfEveryoneAnswered(game, players);
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
      const current = currentQuestionId(game);
      if (game.session.phase === "QUESTION_OPEN" && current) {
        answers = (await store.listResponses(current.round.id, current.questionId)).length;
      }
      const isHost = me.isHost && room.hostPlayerId === me.id;
      const check = checkCanAdvance(game.session, isHost, expectedVersion, answers);
      if (!check.ok) return check;

      const moved = await moveTo(game, players, nextPosition(game.session, questionCounts(game)));
      if (moved === "stale") return fail("stale_state");
      return ok({ stateVersion: moved.stateVersion, finished: moved.phase === "FINISHED" });
    },

    /** After someone leaves or is removed, the people left may all have answered already. */
    async afterRosterChange(roomId: string): Promise<boolean> {
      const game = await store.getLatestGame(roomId);
      if (!game) return false;
      return revealIfEveryoneAnswered(game, await store.listPlayers(roomId));
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

      const successor = activePlayers(players)
        .filter((p) => p.id !== host.id && isOnline(p, at))
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
      if (!successor) return false;

      const passed = await store.transferHost(room.id, host.id, successor.id);
      if (passed) await onRoomChanged?.(room.id);
      return passed;
    },

    /** The game from one player's point of view. Others' answers only appear once revealed. */
    async viewFor(room: Room, players: Player[], me: Player): Promise<GameView | null> {
      const game = await store.getLatestGame(room.id);
      if (!game) return null;
      const { session, rounds } = game;
      const round = rounds[session.roundIndex];

      let question: GameView["question"] = null;
      let answeredPlayerIds: string[] = [];
      let myAnswer: string | null = null;
      let reveal: GameView["reveal"] = null;

      const current = currentQuestionId(game);
      if (isQuestionPhase(session.phase) && current) {
        const found = (await store.getQuestions()).find((q) => q.id === current.questionId);
        if (found) question = { id: found.id, prompt: found.prompt, options: found.options };

        const activeIds = new Set(activePlayers(players).map((p) => p.id));
        const responses = (await store.listResponses(current.round.id, current.questionId)).filter((r) =>
          activeIds.has(r.playerId),
        );
        answeredPlayerIds = responses.map((r) => r.playerId);
        myAnswer = responses.find((r) => r.playerId === me.id)?.answer.optionId ?? null;
        if (session.phase === "REVEAL") {
          reveal = { answers: responses.map((r) => ({ playerId: r.playerId, optionId: r.answer.optionId })) };
        }
      }

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
        answeredPlayerIds,
        myAnswer,
        reveal,
      };
    },
  };
}

export type GameService = ReturnType<typeof createGameService>;
