/**
 * The design doc's decision metrics (§14), computed from recorded events. Pure:
 * events in, numbers out — so every definition below is unit-tested.
 */
import type { AnalyticsEvent, FeedbackEntry, FeedbackRating } from "@/lib/rooms/store";

export interface Rate {
  numerator: number;
  denominator: number;
  /** 0–1, or null when there's nothing to divide by yet. */
  value: number | null;
}

export interface Metrics {
  window: { from: string; to: string; days: number };
  funnel: Array<{ step: string; label: string; count: number }>;
  decision: {
    roomActivation: Rate;
    completion: Rate;
    invitesPerRoom: number | null;
    shareRate: Rate;
    replay7d: Rate;
    paidConversion: Rate;
    /** Finished rooms where the host started a rematch (engagement phase). */
    rematchRate: Rate;
    /** Live reactions sent per finished game. */
    reactionsPerGame: number | null;
  };
  health: {
    joinFailureRate: Rate;
    joinFailuresByReason: Array<{ reason: string; count: number }>;
    reconnects: { count: number; medianSeconds: number | null };
    paymentFailures: number;
    serverErrors: number;
    clientErrors: number;
    latency: Array<{ route: string; count: number; p50: number; p95: number }>;
    recentErrors: Array<{
      source: "server" | "client";
      message: string;
      path: string;
      count: number;
      lastSeen: string;
    }>;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REPLAY_WINDOW_MS = 7 * DAY_MS;

export const rate = (numerator: number, denominator: number): Rate => ({
  numerator,
  denominator,
  value: denominator > 0 ? numerator / denominator : null,
});

/** Nearest-rank percentile of already-sorted numbers. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function computeMetrics(events: AnalyticsEvent[], window: { from: Date; now: Date }): Metrics {
  const fromIso = window.from.toISOString();
  const inWindow = events.filter((e) => e.createdAt >= fromIso);
  const named = (name: string) => inWindow.filter((e) => e.eventName === name);
  const roomsWith = (name: string) => new Set(named(name).flatMap((e) => (e.roomId ? [e.roomId] : [])));
  // First-time visitors have no session cookie yet: each of their events counts as one visit.
  const visitors = (name: string) => {
    const list = named(name);
    const known = new Set(list.flatMap((e) => (e.anonymousSessionId ? [e.anonymousSessionId] : [])));
    return known.size + list.filter((e) => !e.anonymousSessionId).length;
  };

  const created = roomsWith("room_created");
  const started = roomsWith("game_started");
  const completed = roomsWith("game_completed");
  const shared = roomsWith("wrapped_shared");
  const viewedPremium = roomsWith("premium_pack_viewed");
  const paid = roomsWith("purchase_succeeded");
  const joins = named("player_joined").length;
  // Games, not rooms: a room that rematched finished more than one.
  const completedGames = named("game_completed").length;

  // Replay: of the people who played a finished game, how many started their own room
  // within 7 days. Only people whose 7-day window has fully passed are counted.
  const completedAt = new Map<string, string>();
  for (const e of events) {
    if (e.eventName === "game_completed" && e.roomId && e.createdAt >= fromIso) {
      const prev = completedAt.get(e.roomId);
      if (!prev || e.createdAt < prev) completedAt.set(e.roomId, e.createdAt);
    }
  }
  const firstFinish = new Map<string, number>();
  for (const e of events) {
    const done = e.roomId ? completedAt.get(e.roomId) : undefined;
    if (!done || !e.anonymousSessionId) continue;
    if (e.eventName !== "room_created" && e.eventName !== "player_joined") continue;
    const t = new Date(done).getTime();
    const prev = firstFinish.get(e.anonymousSessionId);
    if (prev === undefined || t < prev) firstFinish.set(e.anonymousSessionId, t);
  }
  const roomsCreatedBy = new Map<string, number[]>();
  for (const e of events) {
    if (e.eventName !== "room_created" || !e.anonymousSessionId) continue;
    const list = roomsCreatedBy.get(e.anonymousSessionId) ?? [];
    list.push(new Date(e.createdAt).getTime());
    roomsCreatedBy.set(e.anonymousSessionId, list);
  }
  let matured = 0;
  let replayed = 0;
  for (const [person, finishedAt] of firstFinish) {
    if (finishedAt + REPLAY_WINDOW_MS > window.now.getTime()) continue;
    matured++;
    const cameBack = (roomsCreatedBy.get(person) ?? []).some(
      (t) => t > finishedAt && t <= finishedAt + REPLAY_WINDOW_MS,
    );
    if (cameBack) replayed++;
  }

  const joinFailures = named("join_failed");
  const byReason = new Map<string, number>();
  for (const e of joinFailures) {
    const reason = String(e.properties.reason ?? "unknown");
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  // A taken or too-long nickname is a typo the player fixes, not a failed join.
  const hardJoinFailures = joinFailures.filter(
    (e) => !String(e.properties.reason ?? "").startsWith("nickname_"),
  ).length;

  const reconnectSeconds = named("connection_restored")
    .map((e) => Number(e.properties.seconds))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  const timings = new Map<string, number[]>();
  for (const e of named("api_timing")) {
    const route = String(e.properties.route ?? "unknown");
    const ms = Number(e.properties.ms);
    if (!Number.isFinite(ms)) continue;
    const list = timings.get(route) ?? [];
    list.push(ms);
    timings.set(route, list);
  }

  const errorGroups = new Map<string, Metrics["health"]["recentErrors"][number]>();
  for (const e of [...named("server_error"), ...named("client_error")]) {
    const source = e.eventName === "server_error" ? ("server" as const) : ("client" as const);
    const message = String(e.properties.message ?? "");
    const path = String(e.properties.path ?? "");
    const key = `${source}|${message}|${path}`;
    const g = errorGroups.get(key) ?? { source, message, path, count: 0, lastSeen: e.createdAt };
    g.count++;
    if (e.createdAt > g.lastSeen) g.lastSeen = e.createdAt;
    errorGroups.set(key, g);
  }

  return {
    window: {
      from: fromIso,
      to: window.now.toISOString(),
      days: Math.round((window.now.getTime() - window.from.getTime()) / DAY_MS),
    },
    funnel: [
      { step: "landing_view", label: "Visited", count: visitors("landing_view") },
      { step: "mode_selected", label: "Picked a mode", count: visitors("mode_selected") },
      { step: "room_created", label: "Created a room", count: created.size },
      { step: "game_started", label: "Started a game", count: started.size },
      { step: "game_completed", label: "Finished a game", count: completed.size },
      { step: "wrapped_shared", label: "Shared results", count: shared.size },
    ],
    decision: {
      roomActivation: rate(started.size, created.size),
      completion: rate(completed.size, started.size),
      invitesPerRoom: created.size > 0 ? joins / created.size : null,
      shareRate: rate(shared.size, completed.size),
      replay7d: rate(replayed, matured),
      paidConversion: rate(paid.size, viewedPremium.size),
      rematchRate: rate([...roomsWith("rematch_started")].filter((id) => completed.has(id)).length, completed.size),
      reactionsPerGame: completedGames > 0 ? named("reaction_sent").length / completedGames : null,
    },
    health: {
      joinFailureRate: rate(hardJoinFailures, hardJoinFailures + joins),
      joinFailuresByReason: [...byReason]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      reconnects: {
        count: reconnectSeconds.length,
        medianSeconds: reconnectSeconds.length ? percentile(reconnectSeconds, 50) : null,
      },
      paymentFailures: named("purchase_failed").length,
      serverErrors: named("server_error").length,
      clientErrors: named("client_error").length,
      latency: [...timings]
        .map(([route, list]) => {
          const sorted = [...list].sort((a, b) => a - b);
          return { route, count: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
        })
        .sort((a, b) => b.p95 - a.p95),
      recentErrors: [...errorGroups.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).slice(0, 15),
    },
  };
}

export interface FeedbackSummary {
  count: number;
  /** 1–4, or null with no ratings yet. */
  average: number | null;
  /** Counts for ratings 4, 3, 2, 1 (best first). */
  byRating: Array<{ rating: FeedbackRating; count: number }>;
  recentComments: Array<{ rating: FeedbackRating; mode: string; comment: string; createdAt: string }>;
}

/** Beta feedback for the dashboard: rating spread, average and the latest comments. */
export function summarizeFeedback(entries: FeedbackEntry[], maxComments = 20): FeedbackSummary {
  const ratings: FeedbackRating[] = [4, 3, 2, 1];
  const total = entries.reduce((sum, e) => sum + e.rating, 0);
  return {
    count: entries.length,
    average: entries.length ? total / entries.length : null,
    byRating: ratings.map((rating) => ({ rating, count: entries.filter((e) => e.rating === rating).length })),
    recentComments: entries
      .filter((e): e is FeedbackEntry & { comment: string } => !!e.comment)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, maxComments)
      .map(({ rating, mode, comment, createdAt }) => ({ rating, mode, comment, createdAt })),
  };
}
