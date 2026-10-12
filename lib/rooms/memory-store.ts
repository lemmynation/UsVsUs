import { randomUUID } from "node:crypto";
import type { QuestionHistory } from "@/lib/game/question-picker";
import { BUNDLED_QUESTIONS } from "@/lib/game/questions";
import type { GameResponse, GameRound, GameSession, Question, ScoreEntry, WrappedReport } from "@/types/game";
import { findPack } from "@/lib/premium/catalog";
import type { Payment } from "@/types/premium";
import type { Player, Room } from "@/types/room";
import { nextHost } from "./rules";
import type { ChaosContribution, ChaosMatch, ChaosScoreEntry } from "@/types/chaos";
import type { AnalyticsEvent, CleanupCutoffs, FeedbackEntry, RoomStore } from "./store";

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
  private scores: Array<ScoreEntry & { sessionId: string }> = [];
  private wrapped = new Map<string, WrappedReport>();
  private chaosMatches = new Map<string, ChaosMatch>();
  /** `${matchId}:${step}:${chain}:${playerId}` → contribution + its idempotency key */
  private chaosContributions = new Map<string, ChaosContribution & { idempotencyKey: string }>();
  private chaosScores: Array<ChaosScoreEntry & { matchId: string }> = [];
  private payments = new Map<string, Payment>();
  /** roomId → pack slugs unlocked */
  private entitlements = new Map<string, Set<string>>();
  /** "provider:eventId" → received at */
  private paymentEvents = new Map<string, string>();
  /** sessionTokenHash → pack slugs bought from that phone */
  private ownedPacks = new Map<string, Set<string>>();
  /** sessionTokenHash → questionId → history */
  private seen = new Map<string, Map<string, QuestionHistory>>();
  readonly events: AnalyticsEvent[] = [];
  private feedback = new Map<
    string,
    FeedbackEntry & { roomId: string | null; sessionId: string | null; playerId: string | null; updatedAt: string }
  >();
  private rateWindows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly questions: Question[] = BUNDLED_QUESTIONS) {}

  async createRoom(input: Parameters<RoomStore["createRoom"]>[0]) {
    for (const r of this.rooms.values()) {
      if (r.joinCode === input.joinCode) return "join_code_taken" as const;
    }
    const room: Room = {
      id: randomUUID(),
      joinCode: input.joinCode,
      mode: input.mode,
      experience: input.experience ?? "quick_party",
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
    // Mirrors the SQL: the entitlement is checked in the same step as the start.
    if (input.packSlug && !this.entitlements.get(room.id)?.has(input.packSlug)) return "pack_locked" as const;

    room.status = "IN_GAME";
    room.selectedPackId = input.packSlug ?? null;
    const session: GameSession = {
      id: randomUUID(),
      roomId: room.id,
      status: "active",
      packSlug: input.packSlug ?? null,
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
      return { ...round, questionIds: [...round.questionIds], subjectPlayerIds: [...round.subjectPlayerIds] };
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
      .map((r) => ({ ...r, questionIds: [...r.questionIds], subjectPlayerIds: [...r.subjectPlayerIds] }));
    return { session: { ...session }, rounds };
  }

  async listResponses(roundId: string, questionId: string) {
    return this.responses
      .filter((r) => r.roundId === roundId && r.questionId === questionId)
      .map((r) => ({ ...r, answer: { ...r.answer } }));
  }

  async listSessionResponses(sessionId: string) {
    return this.responses.filter((r) => r.sessionId === sessionId).map((r) => ({ ...r, answer: { ...r.answer } }));
  }

  async getWrapped(sessionId: string) {
    const report = this.wrapped.get(sessionId);
    return report ? structuredClone(report) : null;
  }

  async listRoomWrapped(roomId: string) {
    return [...this.sessions.values()]
      .filter((s) => s.roomId === roomId && this.wrapped.has(s.id))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((s) => structuredClone(this.wrapped.get(s.id)!));
  }

  async saveWrapped(sessionId: string, report: WrappedReport) {
    // Mirrors the SQL: the first report saved wins.
    if (!this.wrapped.has(sessionId) && this.sessions.has(sessionId)) {
      this.wrapped.set(sessionId, structuredClone(report));
    }
    return structuredClone(this.wrapped.get(sessionId) ?? report);
  }

  async listScores(sessionId: string) {
    return this.scores
      .filter((s) => s.sessionId === sessionId)
      .map((s): ScoreEntry => ({
        playerId: s.playerId,
        roundIndex: s.roundIndex,
        questionIndex: s.questionIndex,
        points: s.points,
        award: s.award,
      }));
  }

  async recordScores(sessionId: string, entries: ScoreEntry[]) {
    for (const entry of entries) {
      const exists = this.scores.some(
        (e) =>
          e.sessionId === sessionId &&
          e.playerId === entry.playerId &&
          e.roundIndex === entry.roundIndex &&
          e.questionIndex === entry.questionIndex,
      );
      // Mirrors the SQL: unique per player per question, and skip players who already left.
      if (!exists && this.players.has(entry.playerId)) this.scores.push({ ...entry, sessionId });
    }
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

  async startChainMatch(input: Parameters<RoomStore["startChainMatch"]>[0]) {
    const room = this.rooms.get(input.roomId);
    if (!room || room.status !== "LOBBY") return "not_in_lobby" as const;
    if (room.experience !== "chain_reactions") return "wrong_experience" as const;
    const active = [...this.players.values()].filter((p) => p.roomId === room.id && p.status === "active");
    if (active.length < input.minPlayers) return "not_enough_players" as const;
    room.status = "IN_GAME";
    const match: ChaosMatch = {
      id: randomUUID(),
      roomId: room.id,
      gameId: input.gameId,
      plan: structuredClone(input.plan),
      phase: "STEP_OPEN",
      step: 1,
      revealChain: null,
      stateVersion: 1,
      phaseStartedAt: input.now,
      startedAt: input.now,
      endedAt: null,
    };
    this.chaosMatches.set(match.id, match);
    return structuredClone(match);
  }

  async getLatestChainMatch(roomId: string) {
    const latest = [...this.chaosMatches.values()]
      .filter((m) => m.roomId === roomId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    return latest ? structuredClone(latest) : null;
  }

  async submitContribution(input: Parameters<RoomStore["submitContribution"]>[0]) {
    const match = this.chaosMatches.get(input.matchId);
    if (!match || match.phase !== "STEP_OPEN" || match.step !== input.step) return "not_open" as const;
    const assigned = match.plan.assignments.some(
      (a) => a.step === input.step && a.chain === input.chain && a.playerId === input.playerId,
    );
    if (!assigned) return "not_assigned" as const;
    const key = `${input.matchId}:${input.step}:${input.chain}:${input.playerId}`;
    const existing = this.chaosContributions.get(key);
    if (existing?.idempotencyKey === input.idempotencyKey) return "duplicate" as const;
    this.chaosContributions.set(key, {
      matchId: input.matchId,
      step: input.step,
      chain: input.chain,
      playerId: input.playerId,
      payload: structuredClone(input.payload),
      version: (existing?.version ?? 0) + 1,
      submittedAt: input.now,
      idempotencyKey: input.idempotencyKey,
    });
    return "ok" as const;
  }

  async listContributions(matchId: string) {
    return [...this.chaosContributions.values()]
      .filter((c) => c.matchId === matchId)
      .map((c) => ({
        matchId: c.matchId,
        step: c.step,
        chain: c.chain,
        playerId: c.playerId,
        payload: structuredClone(c.payload),
        version: c.version,
        submittedAt: c.submittedAt,
      }));
  }

  async advanceChainMatch(input: Parameters<RoomStore["advanceChainMatch"]>[0]) {
    const match = this.chaosMatches.get(input.matchId);
    if (!match || match.stateVersion !== input.expectedVersion) return "stale" as const;
    Object.assign(match, {
      phase: input.next.phase,
      step: input.next.step,
      revealChain: input.next.revealChain,
      stateVersion: match.stateVersion + 1,
      phaseStartedAt: input.now,
      endedAt: input.next.phase === "RECAP" ? input.now : match.endedAt,
    });
    const room = this.rooms.get(match.roomId);
    if (input.next.phase === "RECAP" && room?.status === "IN_GAME") room.status = "WRAPPED";
    return structuredClone(match);
  }

  async recordChainScores(matchId: string, entries: ChaosScoreEntry[]) {
    for (const entry of entries) {
      if (!this.players.has(entry.playerId)) continue;
      const exists = this.chaosScores.some(
        (e) =>
          e.matchId === matchId &&
          e.playerId === entry.playerId &&
          e.step === entry.step &&
          e.chain === entry.chain &&
          e.reason === entry.reason,
      );
      if (!exists) this.chaosScores.push({ ...entry, matchId });
    }
  }

  async listChainScores(matchId: string) {
    return this.chaosScores
      .filter((e) => e.matchId === matchId)
      .map((e) => ({ playerId: e.playerId, step: e.step, chain: e.chain, reason: e.reason, points: e.points }));
  }

  async reopenRoom(input: { roomId: string; expiresAt: string }) {
    const room = this.rooms.get(input.roomId);
    if (!room || room.status !== "WRAPPED") return "not_wrapped" as const;
    room.status = "LOBBY";
    room.selectedPackId = null;
    if (room.expiresAt < input.expiresAt) room.expiresAt = input.expiresAt;
    return "reopened" as const;
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
    // Mirrors ON DELETE CASCADE.
    this.responses = this.responses.filter((r) => r.playerId !== playerId);
    this.scores = this.scores.filter((e) => e.playerId !== playerId);
    for (const [k, c] of this.chaosContributions) if (c.playerId === playerId) this.chaosContributions.delete(k);
    this.chaosScores = this.chaosScores.filter((e) => e.playerId !== playerId);
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

  async createPayment(input: Parameters<RoomStore["createPayment"]>[0]) {
    const room = this.rooms.get(input.roomId);
    if (!room || room.status !== "LOBBY") return "not_in_lobby" as const;
    if (!findPack(input.packSlug)) return "pack_not_found" as const;
    if (this.entitlements.get(room.id)?.has(input.packSlug)) return "already_unlocked" as const;

    const cutoff = new Date(new Date(input.now).getTime() - 30 * 60_000).toISOString();
    const recent = [...this.payments.values()]
      .filter(
        (p) =>
          p.roomId === room.id &&
          p.packSlug === input.packSlug &&
          p.status === "pending" &&
          p.checkoutUrl !== null &&
          p.createdAt > cutoff,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (recent) return { payment: { ...recent }, reused: true };

    const payment: Payment = {
      id: randomUUID(),
      roomId: room.id,
      packSlug: input.packSlug,
      provider: input.provider,
      checkoutId: null,
      checkoutUrl: null,
      providerPaymentId: null,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "pending",
      createdByPlayerId: input.playerId,
      createdAt: input.now,
      paidAt: null,
    };
    this.payments.set(payment.id, payment);
    return { payment: { ...payment }, reused: false };
  }

  async attachCheckout(paymentId: string, checkoutId: string, checkoutUrl: string) {
    const payment = this.payments.get(paymentId);
    if (payment && payment.checkoutId === null) Object.assign(payment, { checkoutId, checkoutUrl });
  }

  async getPayment(paymentId: string) {
    const payment = this.payments.get(paymentId);
    return payment ? { ...payment } : null;
  }

  async getPaymentByCheckoutId(checkoutId: string) {
    const payment = [...this.payments.values()].find((p) => p.checkoutId === checkoutId);
    return payment ? { ...payment } : null;
  }

  async listPendingPayments(roomId: string) {
    return [...this.payments.values()]
      .filter((p) => p.roomId === roomId && p.status === "pending")
      .map((p) => ({ ...p }));
  }

  async grantEntitlement(paymentId: string, providerPaymentId: string | null, now: string) {
    const payment = this.payments.get(paymentId);
    if (!payment) return "not_found" as const;
    if (payment.status !== "pending") return "already" as const;
    if (!payment.roomId) return "not_found" as const; // room cleaned up
    const unlocked = this.entitlements.get(payment.roomId) ?? new Set<string>();
    const fresh = !unlocked.has(payment.packSlug);
    unlocked.add(payment.packSlug);
    this.entitlements.set(payment.roomId, unlocked);
    Object.assign(payment, { status: fresh ? "paid" : "duplicate", paidAt: now, providerPaymentId });
    // The buyer's phone owns it too (a duplicate payment still counts).
    const buyer = payment.createdByPlayerId ? this.players.get(payment.createdByPlayerId) : undefined;
    if (buyer) {
      const owned = this.ownedPacks.get(buyer.sessionTokenHash) ?? new Set<string>();
      owned.add(payment.packSlug);
      this.ownedPacks.set(buyer.sessionTokenHash, owned);
    }
    return fresh ? ("granted" as const) : ("duplicate" as const);
  }

  async claimOwnedPacks(roomId: string, sessionTokenHash: string) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    const unlocked = this.entitlements.get(roomId) ?? new Set<string>();
    let added = 0;
    for (const slug of this.ownedPacks.get(sessionTokenHash) ?? []) {
      if (unlocked.has(slug) || !findPack(slug)?.modes.includes(room.mode)) continue;
      unlocked.add(slug);
      added++;
    }
    this.entitlements.set(roomId, unlocked);
    return added;
  }

  async listEntitlements(roomId: string) {
    return [...(this.entitlements.get(roomId) ?? [])];
  }

  async recordPaymentEvent(provider: string, eventId: string, now: string) {
    const key = `${provider}:${eventId}`;
    if (this.paymentEvents.has(key)) return false;
    this.paymentEvents.set(key, now);
    return true;
  }

  async recordEvent(event: AnalyticsEvent) {
    this.events.push(event);
  }

  async listEvents(sinceIso: string, limit: number) {
    return this.events
      .filter((e) => e.createdAt >= sinceIso)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map((e) => structuredClone(e));
  }

  async cleanupExpiredData(cutoffs: CleanupCutoffs) {
    const goneRooms = new Set([...this.rooms.values()].filter((r) => r.expiresAt < cutoffs.rooms).map((r) => r.id));
    const goneSessions = new Set([...this.sessions.values()].filter((s) => goneRooms.has(s.roomId)).map((s) => s.id));
    for (const id of goneRooms) {
      this.rooms.delete(id);
      this.entitlements.delete(id);
    }
    for (const [id, p] of this.players) if (goneRooms.has(p.roomId)) this.players.delete(id);
    for (const id of goneSessions) {
      this.sessions.delete(id);
      this.wrapped.delete(id);
    }
    for (const [id, r] of this.rounds) if (goneSessions.has(r.sessionId)) this.rounds.delete(id);
    this.responses = this.responses.filter((r) => !goneSessions.has(r.sessionId));
    this.scores = this.scores.filter((s) => !goneSessions.has(s.sessionId));
    const goneMatches = new Set(
      [...this.chaosMatches.values()].filter((m) => goneRooms.has(m.roomId)).map((m) => m.id),
    );
    for (const id of goneMatches) this.chaosMatches.delete(id);
    for (const [k, c] of this.chaosContributions) if (goneMatches.has(c.matchId)) this.chaosContributions.delete(k);
    this.chaosScores = this.chaosScores.filter((e) => !goneMatches.has(e.matchId));
    // Paid records are kept for accounting, unlinked from the room; unpaid intents go.
    for (const [id, p] of this.payments) {
      if (!p.roomId || !goneRooms.has(p.roomId)) continue;
      if (p.status === "pending") this.payments.delete(id);
      else p.roomId = null;
    }
    for (const e of this.events) if (e.roomId && goneRooms.has(e.roomId)) e.roomId = null;
    for (const f of this.feedback.values()) {
      if (f.roomId && goneRooms.has(f.roomId)) Object.assign(f, { roomId: null, sessionId: null, playerId: null });
    }

    let history = 0;
    for (const [hash, mine] of this.seen) {
      for (const [questionId, h] of mine) {
        if (h.lastSeenAt < cutoffs.questionHistory) {
          mine.delete(questionId);
          history++;
        }
      }
      if (mine.size === 0) this.seen.delete(hash);
    }
    const before = this.events.length;
    const kept = this.events.filter((e) => e.createdAt >= cutoffs.events);
    this.events.length = 0;
    for (const e of kept) this.events.push(e);
    let paymentEvents = 0;
    for (const [key, at] of this.paymentEvents) {
      if (at < cutoffs.paymentEvents) {
        this.paymentEvents.delete(key);
        paymentEvents++;
      }
    }
    let feedback = 0;
    for (const [key, f] of this.feedback) {
      if (f.createdAt < cutoffs.feedback) {
        this.feedback.delete(key);
        feedback++;
      }
    }
    const nowMs = Date.now();
    for (const [key, w] of this.rateWindows) if (w.resetAt < nowMs) this.rateWindows.delete(key);
    return { rooms: goneRooms.size, questionHistory: history, events: before - kept.length, paymentEvents, feedback };
  }

  async hitRateLimit(key: string, max: number, windowMs: number, now: string) {
    const t = new Date(now).getTime();
    const w = this.rateWindows.get(key);
    if (!w || w.resetAt <= t) {
      this.rateWindows.set(key, { count: 1, resetAt: t + windowMs });
      return 1 <= max;
    }
    w.count++;
    return w.count <= max;
  }

  async saveFeedback(input: Parameters<RoomStore["saveFeedback"]>[0]) {
    const key = `${input.sessionId}:${input.playerId}`;
    const existing = this.feedback.get(key);
    this.feedback.set(key, {
      roomId: input.roomId,
      sessionId: input.sessionId,
      playerId: input.playerId,
      mode: input.mode,
      rating: input.rating,
      // A save without a comment (just a rating tap) never erases one already sent.
      comment: input.comment ?? existing?.comment ?? null,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
    });
  }

  async listFeedback(sinceIso: string, limit: number) {
    return [...this.feedback.values()]
      .filter((f) => f.createdAt >= sinceIso)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(({ mode, rating, comment, createdAt }) => ({ mode, rating, comment, createdAt }));
  }

  /** Test helper: force a room's expiry. */
  _setExpiresAt(roomId: string, expiresAt: string) {
    const room = this.rooms.get(roomId);
    if (room) room.expiresAt = expiresAt;
  }
}
