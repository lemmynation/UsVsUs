import { randomUUID } from "node:crypto";
import type { QuestionHistory } from "@/lib/game/question-picker";
import { BUNDLED_QUESTIONS } from "@/lib/game/questions";
import type { GameResponse, GameRound, GameSession, Question } from "@/types/game";
import type { Player, Room } from "@/types/room";
import { nextHost } from "./rules";
import type { AnalyticsEvent, RoomStore } from "./store";

/**
 * In-process store for local development without Supabase and for tests.
 * Single-threaded JS makes each method atomic. Data is lost on restart.
 */
export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();
  private players = new Map<string, Player>();
  private sessions = new Map<string, GameSession>();
  private rounds = new Map<string, GameRound>();
  private responses: GameResponse[] = [];
  /** sessionTokenHash → questionId → history */
  private seen = new Map<string, Map<string, QuestionHistory>>();
  readonly events: AnalyticsEvent[] = [];

  constructor(private readonly questions: Question[] = BUNDLED_QUESTIONS) {}

  async createRoom(input: Parameters<RoomStore["createRoom"]>[0]) {
    for (const r of this.rooms.values()) {
      if (r.joinCode === input.joinCode) return "join_code_taken" as const;
    }
    const room: Room = {
      id: randomUUID(),
      joinCode: input.joinCode,
      mode: input.mode,
      name: input.name,
      hostPlayerId: null,
      status: "LOBBY",
      selectedPackId: null,
      createdAt: input.now,
      expiresAt: input.expiresAt,
    };
    const host: Player = {
      id: randomUUID(),
      roomId: room.id,
      nickname: input.host.nickname,
      sessionTokenHash: input.host.sessionTokenHash,
      isHost: true,
      status: "active",
      joinedAt: input.now,
      lastSeenAt: input.now,
    };
    room.hostPlayerId = host.id;
    this.rooms.set(room.id, room);
    this.players.set(host.id, host);
    return { room: { ...room }, host: { ...host } };
  }

  async getRoomById(id: string) {
    const room = this.rooms.get(id);
    return room ? { ...room } : null;
  }

  async getRoomByCode(joinCode: string) {
    for (const r of this.rooms.values()) {
      if (r.joinCode === joinCode) return { ...r };
    }
    return null;
  }

  async listPlayers(roomId: string) {
    return [...this.players.values()].filter((p) => p.roomId === roomId).map((p) => ({ ...p }));
  }

  async addPlayer(input: Parameters<RoomStore["addPlayer"]>[0]) {
    const room = this.rooms.get(input.roomId);
    if (!room || room.status !== "LOBBY" || new Date(room.expiresAt) <= new Date(input.now)) {
      return "room_not_open" as const;
    }
    const active = [...this.players.values()].filter((p) => p.roomId === room.id && p.status === "active");
    if (active.length >= input.maxPlayers) return "room_full" as const;
    if (active.some((p) => p.nickname.toLowerCase() === input.nickname.toLowerCase())) {
      return "nickname_taken" as const;
    }
    const player: Player = {
      id: randomUUID(),
      roomId: room.id,
      nickname: input.nickname,
      sessionTokenHash: input.sessionTokenHash,
      isHost: false,
      status: "active",
      joinedAt: input.now,
      lastSeenAt: input.now,
    };
    this.players.set(player.id, player);
    return { ...player };
  }

  async startGame(input: Parameters<RoomStore["startGame"]>[0]) {
    const room = this.rooms.get(input.roomId);
    if (!room || room.status !== "LOBBY") return "not_in_lobby" as const;
    const active = [...this.players.values()].filter((p) => p.roomId === room.id && p.status === "active");
    if (active.length < input.minPlayers) return "not_enough_players" as const;

    room.status = "IN_GAME";
    const session: GameSession = {
      id: randomUUID(),
      roomId: room.id,
      status: "active",
      phase: "ROUND_INTRO",
      roundIndex: 0,
      questionIndex: 0,
      stateVersion: 1,
      phaseStartedAt: input.now,
      startedAt: input.now,
      endedAt: null,
    };
    this.sessions.set(session.id, session);
    const rounds = input.rounds.map((r, roundIndex) => {
      const round: GameRound = { id: randomUUID(), sessionId: session.id, roundIndex, ...r };
      this.rounds.set(round.id, round);
      return { ...round, questionIds: [...round.questionIds] };
    });
    return { session: { ...session }, rounds };
  }

  async getLatestGame(roomId: string) {
    const session = [...this.sessions.values()]
      .filter((s) => s.roomId === roomId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (!session) return null;
    const rounds = [...this.rounds.values()]
      .filter((r) => r.sessionId === session.id)
      .sort((a, b) => a.roundIndex - b.roundIndex)
      .map((r) => ({ ...r, questionIds: [...r.questionIds] }));
    return { session: { ...session }, rounds };
  }

  async listResponses(roundId: string, questionId: string) {
    return this.responses
      .filter((r) => r.roundId === roundId && r.questionId === questionId)
      .map((r) => ({ ...r, answer: { ...r.answer } }));
  }

  async submitResponse(input: Parameters<RoomStore["submitResponse"]>[0]) {
    const s = this.sessions.get(input.sessionId);
    const round = this.rounds.get(input.roundId);
    const open =
      s?.phase === "QUESTION_OPEN" &&
      s.roundIndex === input.roundIndex &&
      s.questionIndex === input.questionIndex &&
      round?.sessionId === s.id &&
      round.questionIds[input.questionIndex] === input.questionId;
    if (!open) return "not_open" as const;
    const exists = this.responses.some(
      (r) => r.roundId === input.roundId && r.questionId === input.questionId && r.playerId === input.playerId,
    );
    if (exists) return "duplicate" as const;
    this.responses.push({
      id: randomUUID(),
      sessionId: input.sessionId,
      roundId: input.roundId,
      questionId: input.questionId,
      playerId: input.playerId,
      answer: { ...input.answer },
      submittedAt: input.now,
    });
    return "ok" as const;
  }

  async advanceGame(input: Parameters<RoomStore["advanceGame"]>[0]) {
    const s = this.sessions.get(input.sessionId);
    if (!s || s.stateVersion !== input.expectedVersion) return "stale" as const;
    Object.assign(s, input.next, { stateVersion: s.stateVersion + 1, phaseStartedAt: input.now });
    if (input.next.phase === "FINISHED") {
      s.status = "finished";
      s.endedAt = input.now;
      const room = this.rooms.get(s.roomId);
      if (room?.status === "IN_GAME") room.status = "WRAPPED";
    }
    return { ...s };
  }

  async transferHost(roomId: string, fromPlayerId: string, toPlayerId: string) {
    const room = this.rooms.get(roomId);
    const from = this.players.get(fromPlayerId);
    const to = this.players.get(toPlayerId);
    if (!room || room.hostPlayerId !== fromPlayerId || !from || to?.roomId !== roomId || to.status !== "active") {
      return false;
    }
    from.isHost = false;
    to.isHost = true;
    room.hostPlayerId = to.id;
    return true;
  }

  async getQuestions() {
    return this.questions;
  }

  async getQuestionHistory(sessionTokenHashes: string[]) {
    const merged = new Map<string, QuestionHistory>();
    for (const hash of sessionTokenHashes) {
      for (const [questionId, h] of this.seen.get(hash) ?? []) {
        const prev = merged.get(questionId);
        merged.set(questionId, {
          seenCount: (prev?.seenCount ?? 0) + h.seenCount,
          lastSeenAt: prev && prev.lastSeenAt > h.lastSeenAt ? prev.lastSeenAt : h.lastSeenAt,
        });
      }
    }
    return merged;
  }

  async recordQuestionSeen(sessionTokenHashes: string[], questionId: string, now: string) {
    for (const hash of sessionTokenHashes) {
      const mine = this.seen.get(hash) ?? new Map<string, QuestionHistory>();
      const prev = mine.get(questionId);
      mine.set(questionId, { seenCount: (prev?.seenCount ?? 0) + 1, lastSeenAt: now });
      this.seen.set(hash, mine);
    }
  }

  async kickPlayer(playerId: string) {
    const player = this.players.get(playerId);
    if (player) player.status = "kicked";
  }

  async removePlayer(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) return;
    const room = this.rooms.get(player.roomId);
    const roomPlayers = [...this.players.values()].filter((p) => p.roomId === player.roomId);
    this.players.delete(playerId);
    this.responses = this.responses.filter((r) => r.playerId !== playerId); // mirrors ON DELETE CASCADE
    if (!room || !player.isHost) return;

    const successor = nextHost(roomPlayers, playerId);
    if (successor) {
      this.players.get(successor.id)!.isHost = true;
      room.hostPlayerId = successor.id;
    } else {
      room.hostPlayerId = null;
      if (room.status === "LOBBY" || room.status === "IN_GAME") room.status = "ABANDONED";
    }
  }

  async touchPlayer(playerId: string, now: string) {
    const player = this.players.get(playerId);
    if (player) player.lastSeenAt = now;
  }

  async recordEvent(event: AnalyticsEvent) {
    this.events.push(event);
  }

  /** Test helper: force a room's expiry. */
  _setExpiresAt(roomId: string, expiresAt: string) {
    const room = this.rooms.get(roomId);
    if (room) room.expiresAt = expiresAt;
  }
}
