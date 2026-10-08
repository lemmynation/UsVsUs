/**
 * Premium packs (design doc §8): host buys a pack → provider checkout → server
 * verifies with the provider → room entitlement → the pack unlocks for everyone
 * in the room, once. No dependency on Next.js or a gateway SDK, so it's testable.
 *
 * Trust rule: nothing the client or a webhook says unlocks a pack. Every unlock
 * goes through `verifyAndGrant`, which asks the provider directly and checks the
 * amount, currency and that the checkout belongs to this payment.
 */
import { loadMembership, type MembershipError } from "@/lib/rooms/membership";
import type { Result } from "@/lib/rooms/rules";
import type { RoomStore } from "@/lib/rooms/store";
import type { Payment, PremiumView } from "@/types/premium";
import type { Room } from "@/types/room";
import { findPack, formatPrice, packsForMode } from "./catalog";
import type { PaymentProvider } from "./provider";

export interface PremiumServiceDeps {
  store: RoomStore;
  /** Null when no provider is configured: premium is hidden and checkout refused. */
  provider: PaymentProvider | null;
  now: () => Date;
}

export type CheckoutError =
  | MembershipError
  | "not_host"
  | "premium_disabled"
  | "pack_not_found"
  | "already_unlocked"
  | "not_in_lobby"
  | "checkout_failed";

export type VerifyOutcome = "granted" | "already" | "duplicate" | "pending" | "mismatch" | "not_found";

const ok = <T>(value: T) => ({ ok: true, value }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

/** A checkout left open longer than this is treated as abandoned in the UI (it can still be confirmed). */
const PENDING_CHECKOUT_MS = 30 * 60_000;

export function createPremiumService({ store, provider, now }: PremiumServiceDeps) {
  const isRecent = (p: Payment) => now().getTime() - new Date(p.createdAt).getTime() < PENDING_CHECKOUT_MS;

  /** Asks the provider about a payment's checkout and unlocks the pack if — and only if — it checks out. */
  async function verifyAndGrant(payment: Payment): Promise<VerifyOutcome> {
    if (payment.status !== "pending") return "already";
    if (!provider || payment.provider !== provider.name || !payment.checkoutId) return "pending";

    const status = await provider.getCheckout(payment.checkoutId);
    if (!status.paid) return "pending";
    // The price on record (set by the server) must be what was actually paid, for this payment.
    if (status.amountMinor !== payment.amountMinor || status.currency !== payment.currency) return "mismatch";
    if (status.paymentRef !== payment.id) return "mismatch";

    const result = await store.grantEntitlement(payment.id, status.providerPaymentId, now().toISOString());
    return result;
  }

  return {
    verifyAndGrant,

    /** Packs for this room's mode, with what's unlocked. */
    async view(room: Room): Promise<PremiumView> {
      const packs = packsForMode(room.mode);
      if (!provider || packs.length === 0) return { enabled: false, packs: [], pendingCheckout: false };
      const [unlocked, pending] = await Promise.all([
        store.listEntitlements(room.id),
        store.listPendingPayments(room.id),
      ]);
      return {
        enabled: true,
        packs: packs.map((p) => ({
          slug: p.slug,
          name: p.name,
          emoji: p.emoji,
          tagline: p.tagline,
          perks: p.perks,
          price: formatPrice(p.priceMinor),
          unlocked: unlocked.includes(p.slug),
        })),
        pendingCheckout: pending.some((p) => p.checkoutId !== null && isRecent(p)),
      };
    },

    /** Host-only: opens (or reuses) a checkout for a pack. Returns the provider's checkout page. */
    async startCheckout(
      roomId: string,
      sessionHash: string,
      input: { packSlug: string; origin: string },
    ): Promise<Result<{ checkoutUrl: string; paymentId: string; reused: boolean }, CheckoutError>> {
      const membership = await loadMembership(store, roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, me } = membership.value;
      if (!me.isHost || room.hostPlayerId !== me.id) return fail("not_host");
      if (!provider) return fail("premium_disabled");

      const pack = findPack(input.packSlug);
      if (!pack || !pack.modes.includes(room.mode)) return fail("pack_not_found");

      const opened = await store.createPayment({
        roomId: room.id,
        packSlug: pack.slug,
        provider: provider.name,
        amountMinor: pack.priceMinor,
        currency: pack.currency,
        playerId: me.id,
        now: now().toISOString(),
      });
      if (typeof opened === "string") return fail(opened);
      const { payment, reused } = opened;
      if (reused && payment.checkoutUrl) {
        return ok({ checkoutUrl: payment.checkoutUrl, paymentId: payment.id, reused: true });
      }

      const back = `${input.origin}/room/${room.id}`;
      try {
        const checkout = await provider.createCheckout({
          paymentId: payment.id,
          roomId: room.id,
          pack,
          successUrl: `${back}?checkout=success`,
          cancelUrl: `${back}?checkout=cancelled`,
        });
        await store.attachCheckout(payment.id, checkout.checkoutId, checkout.checkoutUrl);
        return ok({ checkoutUrl: checkout.checkoutUrl, paymentId: payment.id, reused: false });
      } catch (error) {
        console.error("[premium] createCheckout failed", error);
        return fail("checkout_failed");
      }
    },

    /**
     * Re-checks the room's pending payments with the provider. Called when the host
     * comes back from checkout (and from a "Check payment" button), so a pack still
     * unlocks if the provider's webhook never arrives.
     */
    async confirmForRoom(
      roomId: string,
      sessionHash: string,
    ): Promise<
      Result<{ unlocked: string[]; granted: string[]; pending: boolean; mismatched: number }, MembershipError>
    > {
      const membership = await loadMembership(store, roomId, sessionHash);
      if (!membership.ok) return membership;
      const granted: string[] = [];
      let mismatched = 0;
      for (const payment of await store.listPendingPayments(roomId)) {
        const outcome = await verifyAndGrant(payment);
        if (outcome === "granted") granted.push(payment.packSlug);
        if (outcome === "mismatch") mismatched++;
      }
      const [unlocked, stillPending] = await Promise.all([
        store.listEntitlements(roomId),
        store.listPendingPayments(roomId),
      ]);
      return ok({
        unlocked,
        granted,
        pending: stillPending.some((p) => p.checkoutId !== null),
        mismatched,
      });
    },

    /**
     * Provider webhook. A valid event only *prompts* a re-check with the provider.
     * The event is recorded as handled only after that succeeds: if the provider
     * can't be reached, this throws, the route answers 500 and the provider's retry
     * gets a fresh chance (instead of being dropped as a duplicate). Handling the
     * same event twice is harmless — unlocking is exactly-once.
     */
    async handleWebhook(
      rawBody: string,
      headers: Headers,
    ): Promise<{
      outcome: "invalid" | "duplicate_event" | "ignored" | "unknown_checkout" | VerifyOutcome;
      payment: Payment | null;
    }> {
      if (!provider) return { outcome: "invalid", payment: null };
      const event = await provider.parseWebhook(rawBody, headers);
      if (!event) return { outcome: "invalid", payment: null };

      let outcome: VerifyOutcome | "ignored" | "unknown_checkout" = "ignored";
      const payment = event.checkoutId ? await store.getPaymentByCheckoutId(event.checkoutId) : null;
      if (event.checkoutId) outcome = payment ? await verifyAndGrant(payment) : "unknown_checkout";
      const firstTime = await store.recordPaymentEvent(provider.name, event.eventId, now().toISOString());
      return { outcome: firstTime || outcome === "granted" ? outcome : "duplicate_event", payment };
    },
  };
}

export type PremiumService = ReturnType<typeof createPremiumService>;
