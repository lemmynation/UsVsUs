import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createGameService, type GameService } from "@/lib/game/service";
import { GAME_CONFIG } from "@/lib/game/state-machine";
import { BUNDLED_QUESTIONS } from "@/lib/game/questions";
import { formatPrice, PACKS } from "@/lib/premium/catalog";
import { FakePaymentProvider } from "@/lib/premium/fake-provider";
import { verifyPayMongoSignature } from "@/lib/premium/paymongo-signature";
import type { PaymentProvider } from "@/lib/premium/provider";
import { createPremiumService, type PremiumService } from "@/lib/premium/service";
import { MemoryRoomStore } from "@/lib/rooms/memory-store";
import { createRoomService, type RoomService } from "@/lib/rooms/service";
import type { Mode } from "@/types/room";

const ORIGIN = "https://usvsus.test";
const CHAOS = PACKS.find((p) => p.slug === "chaos-night")!;

let store: MemoryRoomStore;
let fake: FakePaymentProvider;
let premium: PremiumService;
let rooms: RoomService;
let game: GameService;
let clock: Date;

function build(provider: PaymentProvider | null) {
  premium = createPremiumService({ store, provider, now: () => clock });
  game = createGameService({ store, now: () => clock, random: () => 0.42 });
  let seq = 0;
  rooms = createRoomService({ store, now: () => clock, randomInt: (m) => seq++ % m, game, premium });
}

beforeEach(() => {
  store = new MemoryRoomStore(structuredClone(BUNDLED_QUESTIONS));
  fake = new FakePaymentProvider();
  clock = new Date("2026-10-08T12:00:00Z");
  build(fake);
});

async function setup(mode: Mode = "circle", guests = ["Ana", "Ben"]) {
  const created = await rooms.createRoom({ mode, nickname: "Lem", sessionHash: "host" });
  if (!created.ok) throw new Error(created.error);
  for (const [i, nickname] of guests.entries()) {
    clock = new Date(clock.getTime() + 1000);
    const joined = await rooms.joinRoom({ code: created.value.room.joinCode, nickname, sessionHash: `g${i + 1}` });
    if (!joined.ok) throw new Error(joined.error);
  }
  return created.value.room;
}

async function checkout(roomId: string, hash = "host") {
  const r = await premium.startCheckout(roomId, hash, { packSlug: CHAOS.slug, origin: ORIGIN });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const checkoutIdOf = (url: string) => url.split("/").at(-1)!;

async function premiumView(roomId: string, hash = "g1") {
  const v = await rooms.getRoomView(roomId, hash);
  if (!v.ok) throw new Error(v.error);
  return v.value.premium;
}

describe("catalog", () => {
  it("prices Chaos Night at ₱99 for Circle", () => {
    expect(CHAOS).toMatchObject({ priceMinor: 9900, currency: "PHP", modes: ["circle"] });
    expect(formatPrice(9900)).toBe("₱99");
    expect(formatPrice(14950)).toBe("₱149.50");
  });
});

describe("premium view", () => {
  it("shows Chaos Night, locked, in a Circle room", async () => {
    const room = await setup();
    expect(await premiumView(room.id)).toEqual({
      enabled: true,
      pendingCheckout: false,
      packs: [expect.objectContaining({ slug: "chaos-night", price: "₱99", unlocked: false })],
    });
  });

  it("is hidden when no payment provider is configured", async () => {
    build(null);
    const room = await setup();
    expect((await premiumView(room.id)).enabled).toBe(false);
  });

  it("is hidden for modes with no packs", async () => {
    const room = await setup("couple", ["Ana"]);
    expect(await premiumView(room.id)).toMatchObject({ enabled: false, packs: [] });
  });
});

describe("startCheckout", () => {
  it("opens a checkout at the catalog price, coming back to the room", async () => {
    const room = await setup();
    const { checkoutUrl } = await checkout(room.id);
    const c = fake.get(checkoutIdOf(checkoutUrl))!;
    expect(c.amountMinor).toBe(9900);
    expect(c.successUrl).toBe(`${ORIGIN}/room/${room.id}?checkout=success`);
    expect(c.cancelUrl).toBe(`${ORIGIN}/room/${room.id}?checkout=cancelled`);
  });

  it("reuses the open checkout on a double tap instead of starting a second payment", async () => {
    const room = await setup();
    const first = await checkout(room.id);
    const second = await checkout(room.id);
    expect(second).toMatchObject({ reused: true, checkoutUrl: first.checkoutUrl, paymentId: first.paymentId });
  });

  it("is host-only, Circle-only here, and refused once the game started", async () => {
    const room = await setup();
    expect(await premium.startCheckout(room.id, "g1", { packSlug: CHAOS.slug, origin: ORIGIN })).toEqual({
      ok: false,
      error: "not_host",
    });
    const couple = await setup("couple", ["Ana"]);
    expect(await premium.startCheckout(couple.id, "host", { packSlug: CHAOS.slug, origin: ORIGIN })).toEqual({
      ok: false,
      error: "pack_not_found",
    });
    await game.startGame(room.id, "host");
    expect(await premium.startCheckout(room.id, "host", { packSlug: CHAOS.slug, origin: ORIGIN })).toEqual({
      ok: false,
      error: "not_in_lobby",
    });
  });

  it("is refused when premium is off or the pack is already unlocked", async () => {
    const room = await setup();
    const { checkoutUrl } = await checkout(room.id);
    fake.pay(checkoutIdOf(checkoutUrl));
    await premium.confirmForRoom(room.id, "host");
    expect(await premium.startCheckout(room.id, "host", { packSlug: CHAOS.slug, origin: ORIGIN })).toEqual({
      ok: false,
      error: "already_unlocked",
    });
    build(null);
    expect(await premium.startCheckout(room.id, "host", { packSlug: CHAOS.slug, origin: ORIGIN })).toEqual({
      ok: false,
      error: "premium_disabled",
    });
  });

  it("reports a provider outage as checkout_failed", async () => {
    build({
      name: "fake",
      createCheckout: () => Promise.reject(new Error("down")),
      getCheckout: (c) => fake.getCheckout(c),
      parseWebhook: (b, h) => fake.parseWebhook(b, h),
    });
    const room = await setup();
    expect(await premium.startCheckout(room.id, "host", { packSlug: CHAOS.slug, origin: ORIGIN })).toEqual({
      ok: false,
      error: "checkout_failed",
    });
  });
});

describe("confirming a payment", () => {
  it("doesn't unlock until the provider says it's paid", async () => {
    const room = await setup();
    await checkout(room.id);
    expect(await premium.confirmForRoom(room.id, "host")).toMatchObject({
      ok: true,
      value: { unlocked: [], granted: [], pending: true },
    });
    expect((await premiumView(room.id)).pendingCheckout).toBe(true);
  });

  it("unlocks the pack for everyone in the room, exactly once", async () => {
    const room = await setup();
    const { checkoutUrl, paymentId } = await checkout(room.id);
    fake.pay(checkoutIdOf(checkoutUrl));

    expect(await premium.confirmForRoom(room.id, "g2")).toMatchObject({
      ok: true,
      value: { unlocked: ["chaos-night"], granted: ["chaos-night"], pending: false },
    });
    expect(await premium.confirmForRoom(room.id, "host")).toMatchObject({ value: { granted: [] } });
    expect((await premiumView(room.id, "g1")).packs[0].unlocked).toBe(true);
    expect((await store.getPayment(paymentId))!.status).toBe("paid");
  });

  it("never unlocks when the paid amount doesn't match the price", async () => {
    const room = await setup();
    const { checkoutUrl } = await checkout(room.id);
    fake.pay(checkoutIdOf(checkoutUrl), { amountMinor: 100 });
    expect(await premium.confirmForRoom(room.id, "host")).toMatchObject({
      value: { unlocked: [], mismatched: 1 },
    });
  });

  it("never unlocks a room with another room's paid checkout", async () => {
    const roomA = await setup();
    const a = await checkout(roomA.id);
    fake.pay(checkoutIdOf(a.checkoutUrl));
    const roomB = await setup();
    const b = await checkout(roomB.id);
    const paymentB = (await store.getPayment(b.paymentId))!;
    // Point B's payment at A's (paid) checkout: the checkout's metadata names A's payment.
    expect(await premium.verifyAndGrant({ ...paymentB, checkoutId: checkoutIdOf(a.checkoutUrl) })).toBe("mismatch");
    expect(await store.listEntitlements(roomB.id)).toEqual([]);
  });

  it("flags a second paid payment as a duplicate instead of unlocking twice", async () => {
    const room = await setup();
    const first = await checkout(room.id);
    clock = new Date(clock.getTime() + 31 * 60_000); // old enough that a fresh checkout opens
    const second = await checkout(room.id);
    expect(second.paymentId).not.toBe(first.paymentId);
    fake.pay(checkoutIdOf(first.checkoutUrl));
    fake.pay(checkoutIdOf(second.checkoutUrl));

    await premium.confirmForRoom(room.id, "host");
    const statuses = [
      (await store.getPayment(first.paymentId))!.status,
      (await store.getPayment(second.paymentId))!.status,
    ];
    expect(statuses.sort()).toEqual(["duplicate", "paid"]);
    expect(await store.listEntitlements(room.id)).toEqual(["chaos-night"]);
  });
});

describe("webhooks", () => {
  const event = (eventId: string, checkoutId: string | null) => JSON.stringify({ eventId, checkoutId });
  const signed = new Headers({ "x-fake-signature": "fake" });

  it("rejects an unsigned (forged) webhook", async () => {
    expect((await premium.handleWebhook(event("e1", "x"), new Headers())).outcome).toBe("invalid");
  });

  it("unlocks only after re-checking with the provider, and ignores repeats", async () => {
    const room = await setup();
    const { checkoutUrl } = await checkout(room.id);
    const id = checkoutIdOf(checkoutUrl);

    // A genuine event for a checkout that isn't actually paid unlocks nothing.
    expect((await premium.handleWebhook(event("e0", id), signed)).outcome).toBe("pending");

    fake.pay(id);
    expect((await premium.handleWebhook(event("e1", id), signed)).outcome).toBe("granted");
    expect((await premium.handleWebhook(event("e1", id), signed)).outcome).toBe("duplicate_event");
    expect(await store.listEntitlements(room.id)).toEqual(["chaos-night"]);
  });

  it("acknowledges events for checkouts it doesn't know, and other event types", async () => {
    expect((await premium.handleWebhook(event("e2", "unknown"), signed)).outcome).toBe("unknown_checkout");
    expect((await premium.handleWebhook(event("e3", null), signed)).outcome).toBe("ignored");
  });

  it("lets the provider's retry through when verification failed the first time", async () => {
    const room = await setup();
    const { checkoutUrl } = await checkout(room.id);
    const id = checkoutIdOf(checkoutUrl);
    fake.pay(id);

    let down = true;
    build({
      name: "fake",
      createCheckout: (i) => fake.createCheckout(i),
      parseWebhook: (b, h) => fake.parseWebhook(b, h),
      getCheckout: (c) => (down ? Promise.reject(new Error("provider down")) : fake.getCheckout(c)),
    });
    await expect(premium.handleWebhook(event("e9", id), signed)).rejects.toThrow("provider down");
    down = false;
    expect((await premium.handleWebhook(event("e9", id), signed)).outcome).toBe("granted"); // same event id
  });
});

describe("playing a pack", () => {
  it("can't start a locked pack", async () => {
    const room = await setup();
    expect(await game.startGame(room.id, "host", { packSlug: CHAOS.slug })).toEqual({
      ok: false,
      error: "pack_locked",
    });
    expect(await game.startGame(room.id, "host", { packSlug: "nope" })).toEqual({ ok: false, error: "pack_not_found" });
  });

  it("plays 4 rounds of 6, with the pack's own questions first", async () => {
    const room = await setup();
    const { checkoutUrl } = await checkout(room.id);
    fake.pay(checkoutIdOf(checkoutUrl));
    await premium.confirmForRoom(room.id, "host");

    expect((await game.startGame(room.id, "host", { packSlug: CHAOS.slug })).ok).toBe(true);
    const { session, rounds } = (await store.getLatestGame(room.id))!;
    expect(session.packSlug).toBe("chaos-night");
    expect(rounds.map((r) => r.questionIds.length)).toEqual(Array(4).fill(GAME_CONFIG.premiumQuestionsPerRound));
    expect(rounds.map((r) => r.gameType)).toEqual(["most_likely", "this_or_that", "most_likely", "most_likely"]);
    // 28 Chaos Night call-outs cover all 18 Who's More Likely slots; its 16 This or That cover 6.
    expect(rounds.flatMap((r) => r.questionIds).every((id) => id.startsWith("cn-"))).toBe(true);
    const v = await rooms.getRoomView(room.id, "g1");
    expect(v.ok && v.value.game?.packSlug).toBe("chaos-night");
  });

  it("never puts pack questions in a free game", async () => {
    for (let i = 0; i < 5; i++) {
      const room = await setup();
      await game.startGame(room.id, "host");
      const ids = (await store.getLatestGame(room.id))!.rounds.flatMap((r) => r.questionIds);
      expect(ids.some((id) => id.startsWith("cn-"))).toBe(false);
    }
  });
});

describe("PayMongo signature", () => {
  const secret = "whsk_test_secret";
  const body = '{"data":{"id":"evt_1"}}';
  const sign = (t: string, b = body) => createHmac("sha256", secret).update(`${t}.${b}`).digest("hex");

  it("accepts a test-mode (te) or live-mode (li) signature over timestamp.body", () => {
    expect(verifyPayMongoSignature(body, `t=1700000000,te=${sign("1700000000")},li=`, secret)).toBe(true);
    expect(verifyPayMongoSignature(body, `t=1700000000,te=,li=${sign("1700000000")}`, secret)).toBe(true);
  });

  it("rejects a tampered body, wrong secret, or missing parts", () => {
    const sig = sign("1700000000");
    expect(verifyPayMongoSignature(body + " ", `t=1700000000,te=${sig}`, secret)).toBe(false);
    expect(verifyPayMongoSignature(body, `t=1700000000,te=${sig}`, "other")).toBe(false);
    expect(verifyPayMongoSignature(body, `te=${sig}`, secret)).toBe(false);
    expect(verifyPayMongoSignature(body, "garbage", secret)).toBe(false);
  });
});

describe("abandoned checkouts", () => {
  it("stop showing as pending after 30 minutes, but can still be confirmed if they were paid", async () => {
    const room = await setup();
    const { checkoutUrl } = await checkout(room.id);
    expect((await premiumView(room.id, "host")).pendingCheckout).toBe(true);
    clock = new Date(clock.getTime() + 31 * 60_000);
    expect((await premiumView(room.id, "host")).pendingCheckout).toBe(false);

    fake.pay(checkoutIdOf(checkoutUrl)); // paid late, e.g. in the wallet app
    expect(await premium.confirmForRoom(room.id, "host")).toMatchObject({ value: { granted: ["chaos-night"] } });
  });
});
