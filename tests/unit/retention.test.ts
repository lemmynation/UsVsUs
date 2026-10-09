import { describe, expect, it } from "vitest";
import { MemoryRoomStore } from "@/lib/rooms/memory-store";
import { RETENTION_DAYS, retentionCutoffs } from "@/lib/retention";

const NOW = new Date("2026-10-30T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

async function room(store: MemoryRoomStore, code: string, expiredDaysAgo: number) {
  const created = await store.createRoom({
    joinCode: code,
    mode: "circle",
    name: null,
    expiresAt: daysAgo(expiredDaysAgo),
    now: daysAgo(expiredDaysAgo + 1),
    host: { nickname: "Host", sessionTokenHash: `hash-${code}` },
  });
  if (created === "join_code_taken") throw new Error("taken");
  return created;
}

async function payment(store: MemoryRoomStore, roomId: string, playerId: string) {
  const result = await store.createPayment({
    roomId,
    packSlug: "chaos-night",
    provider: "fake",
    amountMinor: 9900,
    currency: "PHP",
    playerId,
    now: NOW.toISOString(),
  });
  if (typeof result === "string") throw new Error(result);
  return result.payment;
}

describe("retention cutoffs", () => {
  it("counts each period back from now", () => {
    const c = retentionCutoffs(NOW);
    expect(c.rooms).toBe(daysAgo(RETENTION_DAYS.rooms));
    expect(c.events).toBe(daysAgo(RETENTION_DAYS.events));
  });
});

describe("cleanupExpiredData (memory store)", () => {
  it("deletes long-expired rooms but keeps recent ones and paid records", async () => {
    const store = new MemoryRoomStore();
    const old = await room(store, "AAAAAA", 31);
    const recent = await room(store, "BBBBBB", 5);

    const paid = await payment(store, old.room.id, old.host.id);
    expect(await store.grantEntitlement(paid.id, "pay_1", NOW.toISOString())).toBe("granted");
    const recentPending = await payment(store, recent.room.id, recent.host.id);

    await store.recordEvent({
      anonymousSessionId: null,
      roomId: old.room.id,
      eventName: "room_created",
      properties: {},
      createdAt: daysAgo(30),
    });

    const result = await store.cleanupExpiredData(retentionCutoffs(NOW));
    expect(result.rooms).toBe(1);

    expect(await store.getRoomById(old.room.id)).toBeNull();
    expect(await store.listPlayers(old.room.id)).toEqual([]);
    expect(await store.listEntitlements(old.room.id)).toEqual([]);
    expect(await store.getRoomById(recent.room.id)).not.toBeNull();

    // The paid record survives without its room; the recent pending one is untouched.
    expect(await store.getPayment(paid.id)).toMatchObject({ status: "paid", roomId: null });
    expect(await store.getPayment(recentPending.id)).toMatchObject({ roomId: recent.room.id });
    // The event stays (it's within its own period) but no longer points at the room.
    expect(store.events[0].roomId).toBeNull();
  });

  it("drops unpaid payment intents with their room, and they can't unlock anything after", async () => {
    const store = new MemoryRoomStore();
    const old = await room(store, "CCCCCC", 40);
    const pending = await payment(store, old.room.id, old.host.id);

    await store.cleanupExpiredData(retentionCutoffs(NOW));
    expect(await store.getPayment(pending.id)).toBeNull();
    expect(await store.grantEntitlement(pending.id, "pay_2", NOW.toISOString())).toBe("not_found");
  });

  it("removes old events, question history and webhook ids, keeping recent ones", async () => {
    const store = new MemoryRoomStore();
    const base = { anonymousSessionId: null, roomId: null, eventName: "landing_view", properties: {} };
    await store.recordEvent({ ...base, createdAt: daysAgo(400) });
    await store.recordEvent({ ...base, createdAt: daysAgo(10) });
    await store.recordQuestionSeen(["h1"], "q-old", daysAgo(366));
    await store.recordQuestionSeen(["h1"], "q-new", daysAgo(1));
    await store.recordPaymentEvent("fake", "evt-old", daysAgo(91));
    await store.recordPaymentEvent("fake", "evt-new", daysAgo(1));

    const result = await store.cleanupExpiredData(retentionCutoffs(NOW));
    expect(result).toEqual({ rooms: 0, questionHistory: 1, events: 1, paymentEvents: 1 });

    expect(store.events).toHaveLength(1);
    expect([...(await store.getQuestionHistory(["h1"])).keys()]).toEqual(["q-new"]);
    // Forgotten ids are accepted again; remembered ones are still deduped.
    expect(await store.recordPaymentEvent("fake", "evt-old", NOW.toISOString())).toBe(true);
    expect(await store.recordPaymentEvent("fake", "evt-new", NOW.toISOString())).toBe(false);
  });

  it("lists events since a time, oldest first, up to a limit", async () => {
    const store = new MemoryRoomStore();
    const base = { anonymousSessionId: null, roomId: null, properties: {} };
    await store.recordEvent({ ...base, eventName: "b", createdAt: daysAgo(1) });
    await store.recordEvent({ ...base, eventName: "a", createdAt: daysAgo(2) });
    await store.recordEvent({ ...base, eventName: "old", createdAt: daysAgo(9) });
    expect((await store.listEvents(daysAgo(3), 10)).map((e) => e.eventName)).toEqual(["a", "b"]);
    expect(await store.listEvents(daysAgo(3), 1)).toHaveLength(1);
  });
});
