import { randomUUID } from "node:crypto";
import type { CheckoutStatus, PaymentProvider } from "./provider";

interface FakeCheckout {
  id: string;
  paymentId: string;
  packName: string;
  amountMinor: number;
  successUrl: string;
  cancelUrl: string;
  paid: boolean;
}

/**
 * Stand-in for a real gateway in local dev and E2E tests: its checkout page is
 * /dev/fake-checkout/<id>, where a "Pay" button marks it paid. Never enabled in
 * production (see lib/premium/server.ts).
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake" as const;
  private checkouts = new Map<string, FakeCheckout>();

  async createCheckout(input: Parameters<PaymentProvider["createCheckout"]>[0]) {
    const id = `fake_cs_${randomUUID()}`;
    this.checkouts.set(id, {
      id,
      paymentId: input.paymentId,
      packName: input.pack.name,
      amountMinor: input.pack.priceMinor,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      paid: false,
    });
    return { checkoutId: id, checkoutUrl: `/dev/fake-checkout/${id}` };
  }

  async getCheckout(checkoutId: string): Promise<CheckoutStatus> {
    const c = this.checkouts.get(checkoutId);
    return {
      paid: Boolean(c?.paid),
      amountMinor: c?.paid ? c.amountMinor : null,
      currency: c?.paid ? "PHP" : null,
      providerPaymentId: c?.paid ? `fake_pay_${c.id}` : null,
      paymentRef: c?.paymentId ?? null,
    };
  }

  async parseWebhook(rawBody: string, headers: Headers) {
    if (headers.get("x-fake-signature") !== "fake") return null;
    try {
      const { eventId, checkoutId } = JSON.parse(rawBody) as { eventId?: string; checkoutId?: string };
      return eventId ? { eventId, checkoutId: checkoutId ?? null } : null;
    } catch {
      return null;
    }
  }

  // --- test/dev helpers ---
  get(checkoutId: string): FakeCheckout | undefined {
    const c = this.checkouts.get(checkoutId);
    return c ? { ...c } : undefined;
  }

  pay(checkoutId: string, overrides: { amountMinor?: number } = {}): boolean {
    const c = this.checkouts.get(checkoutId);
    if (!c) return false;
    c.paid = true;
    if (overrides.amountMinor !== undefined) c.amountMinor = overrides.amountMinor;
    return true;
  }
}
