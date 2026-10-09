import { describe, expect, it } from "vitest";
import { MemoryRoomStore } from "@/lib/rooms/memory-store";
import { FEEDBACK_COMMENT_MAX, sanitizeFeedbackComment } from "@/lib/rooms/rules";
import { retentionCutoffs } from "@/lib/retention";

const NOW = "2026-10-30T12:00:00.000Z";

describe("shared rate limit (memory store, same rules as the SQL function)", () => {
  it("allows up to max hits per window, then resets", async () => {
    const store = new MemoryRoomStore();
    const hit = (now: string) => store.hitRateLimit("k", 2, 60_000, now);
    expect(await hit(NOW)).toBe(true);
    expect(await hit(NOW)).toBe(true);
    expect(await hit(NOW)).toBe(false);
    expect(await store.hitRateLimit("other", 2, 60_000, NOW)).toBe(true); // keys are separate
    expect(await hit("2026-10-30T12:01:00.000Z")).toBe(true); // new window
  });
});

describe("feedback comments", () => {
  it("are tidied, capped and empty becomes null", () => {
    expect(sanitizeFeedbackComment("  hi\n\nthere  ")).toBe("hi there");
    expect(sanitizeFeedbackComment("   ")).toBeNull();
    expect(sanitizeFeedbackComment(null)).toBeNull();
    expect(sanitizeFeedbackComment("a ​ b")).toBe("a b"); // zero-width space between spaces
    expect([...sanitizeFeedbackComment("😂".repeat(600))!]).toHaveLength(FEEDBACK_COMMENT_MAX);
  });
});

describe("feedback retention", () => {
  it("unlinks feedback from cleaned-up rooms and deletes it after its own period", async () => {
    const store = new MemoryRoomStore();
    const base = { sessionId: "s", playerId: "p", mode: "friends" as const, rating: 4 as const, comment: "fun" };
    await store.saveFeedback({ ...base, roomId: "r-old", playerId: "p1", now: "2025-09-01T00:00:00.000Z" });
    await store.saveFeedback({ ...base, roomId: "r-new", playerId: "p2", now: "2026-10-29T00:00:00.000Z" });
    const result = await store.cleanupExpiredData(retentionCutoffs(new Date(NOW)));
    expect(result.feedback).toBe(1);
    expect(await store.listFeedback("2000-01-01T00:00:00Z", 10)).toEqual([
      { mode: "friends", rating: 4, comment: "fun", createdAt: "2026-10-29T00:00:00.000Z" },
    ]);
  });
});
