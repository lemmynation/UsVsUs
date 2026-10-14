import { describe, expect, it } from "vitest";
import { computeMetrics, percentile, summarizeFeedback } from "@/lib/analytics/metrics";
import { sanitizeErrorText, sanitizePath } from "@/lib/analytics/sanitize";
import type { AnalyticsEvent } from "@/lib/rooms/store";

const NOW = new Date("2026-10-30T12:00:00Z");
const FROM = new Date("2026-10-01T00:00:00Z");
const day = (d: number, h = 12) => new Date(Date.UTC(2026, 9, d, h)).toISOString();

function ev(eventName: string, at: string, opts: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return { eventName, createdAt: at, anonymousSessionId: null, roomId: null, properties: {}, ...opts };
}
const metrics = (events: AnalyticsEvent[]) => computeMetrics(events, { from: FROM, now: NOW });

describe("decision metrics", () => {
  const events = [
    // Room A: created, 1 guest, started, completed, shared, premium viewed and bought.
    ev("room_created", day(2), { roomId: "A", anonymousSessionId: "host1" }),
    ev("player_joined", day(2), { roomId: "A", anonymousSessionId: "guest1" }),
    ev("game_started", day(2), { roomId: "A" }),
    ev("game_completed", day(2, 13), { roomId: "A" }),
    ev("wrapped_shared", day(2, 14), { roomId: "A" }),
    ev("wrapped_shared", day(2, 15), { roomId: "A" }), // second share, same room
    ev("premium_pack_viewed", day(2), { roomId: "A" }),
    ev("purchase_succeeded", day(2), { roomId: "A" }),
    // Room B: created and started, never finished; premium viewed, not bought.
    ev("room_created", day(3), { roomId: "B", anonymousSessionId: "host2" }),
    ev("player_joined", day(3), { roomId: "B", anonymousSessionId: "guest2" }),
    ev("player_joined", day(3), { roomId: "B", anonymousSessionId: "guest3" }),
    ev("game_started", day(3), { roomId: "B" }),
    ev("premium_pack_viewed", day(3), { roomId: "B" }),
    // Room C: created, nobody came.
    ev("room_created", day(4), { roomId: "C", anonymousSessionId: "host3" }),
    // guest1 from room A starts their own room 3 days later (a replay).
    ev("room_created", day(5), { roomId: "D", anonymousSessionId: "guest1" }),
    // Outside the window: ignored.
    ev("room_created", "2026-09-20T00:00:00.000Z", { roomId: "OLD" }),
  ];
  const m = metrics(events);

  it("counts room activation, completion and share rate per room", () => {
    expect(m.decision.roomActivation).toEqual({ numerator: 2, denominator: 4, value: 0.5 });
    expect(m.decision.completion).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(m.decision.shareRate).toEqual({ numerator: 1, denominator: 1, value: 1 });
  });

  it("averages guests per created room", () => {
    expect(m.decision.invitesPerRoom).toBe(3 / 4);
  });

  it("counts paid conversion among rooms that saw the pack", () => {
    expect(m.decision.paidConversion).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it("counts a replay when a player of a finished game creates a room within 7 days", () => {
    // Participants of finished room A: host1 (didn't come back) and guest1 (did).
    expect(m.decision.replay7d).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it("doesn't count people whose 7 days haven't passed yet", () => {
    const recent = [
      ev("room_created", day(28), { roomId: "R", anonymousSessionId: "h" }),
      ev("game_completed", day(28), { roomId: "R" }),
    ];
    expect(metrics(recent).decision.replay7d).toEqual({ numerator: 0, denominator: 0, value: null });
  });

  it("builds the funnel from visitors down to shares", () => {
    const funnel = metrics([
      ...events,
      ev("landing_view", day(2), { anonymousSessionId: "v1" }),
      ev("landing_view", day(2), { anonymousSessionId: "v1" }),
      ev("landing_view", day(2), { anonymousSessionId: "v2" }),
      // Brand-new visitors (no cookie yet) each count once.
      ev("landing_view", day(2)),
      ev("landing_view", day(3)),
    ]).funnel;
    expect(funnel.map((f) => f.count)).toEqual([4, 0, 4, 2, 1, 1]);
  });

  it("returns empty rates, not zeros, before there's any data", () => {
    expect(metrics([]).decision.completion.value).toBeNull();
    expect(metrics([]).decision.invitesPerRoom).toBeNull();
  });
});

describe("health metrics", () => {
  const m = metrics([
    ev("player_joined", day(2)),
    ev("player_joined", day(2)),
    ev("player_joined", day(2)),
    ev("join_failed", day(2), { properties: { reason: "room_full" } }),
    ev("join_failed", day(2), { properties: { reason: "nickname_taken" } }), // a typo, not a failure
    ev("connection_restored", day(2), { properties: { seconds: 4 } }),
    ev("connection_restored", day(2), { properties: { seconds: 30 } }),
    ev("connection_restored", day(2), { properties: { seconds: 9 } }),
    ev("purchase_failed", day(2)),
    ...Array.from({ length: 20 }, (_, i) =>
      ev("api_timing", day(2), { properties: { route: "answer", ms: (i + 1) * 10 } }),
    ),
    ev("server_error", day(2, 10), { properties: { message: "Boom", path: "/api/x" } }),
    ev("server_error", day(2, 11), { properties: { message: "Boom", path: "/api/x" } }),
    ev("client_error", day(2, 9), { properties: { message: "TypeError: x", path: "/room/:id" } }),
  ]);

  it("rates join failures against all join attempts, by reason", () => {
    expect(m.health.joinFailureRate).toEqual({ numerator: 1, denominator: 4, value: 0.25 });
    expect(m.health.joinFailuresByReason).toEqual([
      { reason: "room_full", count: 1 },
      { reason: "nickname_taken", count: 1 },
    ]);
  });

  it("reports reconnects with the median time offline", () => {
    expect(m.health.reconnects).toEqual({ count: 3, medianSeconds: 9 });
  });

  it("computes p50 and p95 latency per route", () => {
    expect(m.health.latency).toEqual([{ route: "answer", count: 20, p50: 100, p95: 190 }]);
  });

  it("groups identical errors, newest first", () => {
    expect(m.health.serverErrors).toBe(2);
    expect(m.health.clientErrors).toBe(1);
    expect(m.health.recentErrors[0]).toMatchObject({ source: "server", message: "Boom", count: 2 });
    expect(m.health.paymentFailures).toBe(1);
  });
});

describe("percentile", () => {
  it("uses nearest rank", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 95)).toBe(4);
    expect(percentile([], 95)).toBe(0);
  });
});

describe("error text sanitizing", () => {
  it("removes query strings, ids, emails and keys", () => {
    expect(
      sanitizeErrorText(
        "Failed /room/0b1c2d3e-1111-2222-3333-444455556666?checkout=success for a@b.com with sk_test_abcdef123456",
      ),
    ).toBe("Failed /room/:id for :email with :key");
  });

  it("keeps only the route shape of a path", () => {
    expect(sanitizePath("/join/ABC234")).toBe("/join/:code");
    expect(sanitizePath("/room/0b1c2d3e-1111-2222-3333-444455556666?x=1")).toBe("/room/:id");
  });
});

describe("feedback summary", () => {
  const entry = (
    rating: 1 | 2 | 3 | 4,
    comment: string | null,
    at: string,
    game: "mind_match" | "mutation_machine" = "mind_match",
  ) => ({
    mode: "couple" as const,
    game,
    rating,
    comment,
    createdAt: at,
  });

  it("counts ratings best-first, averages them and lists the newest comments", () => {
    const s = summarizeFeedback([entry(4, "So fun", day(2)), entry(4, null, day(3)), entry(2, "Too long", day(4))]);
    expect(s.count).toBe(3);
    expect(s.average).toBeCloseTo(10 / 3);
    expect(s.byRating).toEqual([
      { rating: 4, count: 2 },
      { rating: 3, count: 0 },
      { rating: 2, count: 1 },
      { rating: 1, count: 0 },
    ]);
    expect(s.recentComments.map((c) => c.comment)).toEqual(["Too long", "So fun"]);
  });

  it("averages each game separately", () => {
    const s = summarizeFeedback([
      entry(4, null, day(2)),
      entry(2, null, day(2)),
      entry(3, "Loved the reveal", day(3), "mutation_machine"),
    ]);
    expect(s.byGame).toEqual([
      { game: "mind_match", count: 2, average: 3 },
      { game: "mutation_machine", count: 1, average: 3 },
    ]);
    expect(s.recentComments[0]).toMatchObject({ game: "mutation_machine" });
  });

  it("has no average before anyone rates", () => {
    expect(summarizeFeedback([]).average).toBeNull();
  });
});

describe("engagement metrics", () => {
  it("counts rematches among finished rooms and reactions per finished game", () => {
    const m = metrics([
      ev("room_created", day(2), { roomId: "A" }),
      ev("game_completed", day(2), { roomId: "A" }),
      ev("rematch_started", day(2), { roomId: "A" }),
      ev("game_completed", day(2, 14), { roomId: "A" }), // game two in the same room
      ev("room_created", day(3), { roomId: "B" }),
      ev("game_completed", day(3), { roomId: "B" }),
      ev("rematch_started", day(3), { roomId: "C" }), // not finished in this window: not counted
      ...Array.from({ length: 9 }, () => ev("reaction_sent", day(2), { roomId: "A" })),
    ]);
    expect(m.decision.rematchRate).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(m.decision.reactionsPerGame).toBe(3); // 9 reactions over 3 finished games
    expect(metrics([]).decision.reactionsPerGame).toBeNull();
  });
});

describe("Mutation Machine metrics", () => {
  const at = (d: number, h: number, m = 0, s = 0) => new Date(Date.UTC(2026, 9, d, h, m, s)).toISOString();
  const submitted = (room: string, when: string, step: number, secondsTaken: number, medium = "drawing") =>
    ev("contribution_submitted", when, { roomId: room, properties: { step, medium, secondsTaken } });
  const m = metrics([
    // Room A: one match (10 min), then a rematch that isn't finished yet.
    ev("chaos_match_started", at(2, 10), { roomId: "A" }),
    submitted("A", at(2, 10, 0, 20), 1, 20),
    submitted("A", at(2, 10, 0, 50), 1, 50, "text"),
    submitted("A", at(2, 10, 3, 5), 2, 5),
    submitted("A", at(2, 10, 4), 3, 30, "answer"),
    ev("chaos_step_skipped", at(2, 10, 5), { roomId: "A" }),
    ev("chaos_match_completed", at(2, 10, 10), { roomId: "A" }),
    ev("rematch_started", at(2, 10, 11), { roomId: "A" }),
    ev("wrapped_shared", at(2, 10, 10, 30), { roomId: "A" }),
    ev("chaos_match_started", at(2, 10, 11), { roomId: "A" }),
    // Step 1 again in the rematch: a separate step, so its first action counts on its own.
    submitted("A", at(2, 10, 11, 10), 1, 10),
    // Room B: finished in 20 min, no rematch. An old event without secondsTaken is skipped.
    ev("chaos_match_started", at(3, 10), { roomId: "B" }),
    ev("contribution_submitted", at(3, 10, 1), { roomId: "B", properties: { step: 1, medium: "drawing" } }),
    ev("chaos_match_completed", at(3, 10, 20), { roomId: "B" }),
    // A rematch before the room ever finished doesn't count.
    ev("rematch_started", at(3, 9), { roomId: "B" }),
    // TV codes: three shown, two approved.
    ev("party_screen_pair_requested", at(2, 9)),
    ev("party_screen_pair_requested", at(2, 9)),
    ev("party_screen_pair_requested", at(2, 9)),
    ev("party_screen_pair_approved", at(2, 9), { roomId: "A" }),
    ev("party_screen_pair_approved", at(2, 9), { roomId: "A" }),
  ]).chaos;

  it("counts matches, completion and the median match length", () => {
    expect(m.matchesStarted).toBe(3);
    expect(m.completion).toEqual({ numerator: 2, denominator: 3, value: 2 / 3 });
    expect(m.medianMinutes).toBe(10); // nearest rank of [10, 20]
    expect(m.skipsPerMatch).toBeCloseTo(1 / 3);
  });

  it("measures time to first action per step and every player's wait", () => {
    // First actions: A step 1 = 20, A step 2 = 5, A step 3 = 30, A rematch step 1 = 10.
    expect(m.firstAction).toEqual({ median: 10, p90: 30 });
    // Waits: 20, 50, 5, 30, 10 (B's event has no seconds).
    expect(m.playerWait).toEqual({ median: 20, p90: 50 });
  });

  it("splits drawings from text, and counts rematches and TV pairing", () => {
    expect(m.drawingShare).toEqual({ numerator: 4, denominator: 5, value: 0.8 });
    expect(m.rematchRate).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(m.shareRate).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(m.tvPairing).toEqual({ numerator: 2, denominator: 3, value: 2 / 3 });
  });

  it("is empty, not zero, before any match", () => {
    const empty = metrics([]).chaos;
    expect(empty.completion.value).toBeNull();
    expect(empty.medianMinutes).toBeNull();
    expect(empty.firstAction).toBeNull();
    expect(empty.skipsPerMatch).toBeNull();
  });
});
