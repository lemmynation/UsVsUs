import "server-only";
import { verifyPayMongoSignature } from "./paymongo-signature";
import type { CheckoutStatus, PaymentProvider } from "./provider";

const API = "https://api.paymongo.com/v1";

/** GCash, Maya, cards and QR Ph — each must also be enabled on the PayMongo account. */
export const PAYMENT_METHODS = ["gcash", "paymaya", "card", "qrph"] as const;

interface CheckoutSessionResponse {
  data: {
    id: string;
    attributes: {
      checkout_url: string;
      reference_number?: string | null;
      metadata?: Record<string, string> | null;
      payments?: Array<{
        id: string;
        attributes: { status: string; amount: number; currency: string };
      }>;
    };
  };
}

/** PayMongo hosted checkout. Card and wallet details stay on PayMongo's page. */
export function createPayMongoProvider(opts: { secretKey: string; webhookSecret: string | null }): PaymentProvider {
  const auth = `Basic ${Buffer.from(`${opts.secretKey}:`).toString("base64")}`;

  async function call<T>(path: string, init?: { method: "POST"; body: unknown }): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: init ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // Never log the key; PayMongo's error body says what was wrong with the request.
      throw new Error(`PayMongo ${init?.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  return {
    name: "paymongo",

    async createCheckout({ paymentId, roomId, pack, successUrl, cancelUrl }) {
      const { data } = await call<CheckoutSessionResponse>("/checkout_sessions", {
        method: "POST",
        body: {
          data: {
            attributes: {
              line_items: [
                {
                  name: `${pack.name} — Us vs. Us`,
                  description: "Unlocks the pack for everyone in this room",
                  amount: pack.priceMinor,
                  currency: pack.currency,
                  quantity: 1,
                },
              ],
              payment_method_types: PAYMENT_METHODS,
              success_url: successUrl,
              cancel_url: cancelUrl,
              description: `${pack.name} pack`,
              reference_number: paymentId,
              metadata: { payment_id: paymentId, room_id: roomId, pack: pack.slug },
              send_email_receipt: false,
              show_line_items: true,
            },
          },
        },
      });
      return { checkoutId: data.id, checkoutUrl: data.attributes.checkout_url };
    },

    async getCheckout(checkoutId): Promise<CheckoutStatus> {
      const { data } = await call<CheckoutSessionResponse>(`/checkout_sessions/${encodeURIComponent(checkoutId)}`);
      // A paid session can still read status "active"; payments are what count.
      const paid = data.attributes.payments?.find((p) => p.attributes.status === "paid");
      return {
        paid: Boolean(paid),
        amountMinor: paid?.attributes.amount ?? null,
        currency: paid?.attributes.currency ?? null,
        providerPaymentId: paid?.id ?? null,
        paymentRef: data.attributes.metadata?.payment_id ?? data.attributes.reference_number ?? null,
      };
    },

    async parseWebhook(rawBody, headers) {
      if (!opts.webhookSecret) return null;
      const header = headers.get("paymongo-signature");
      if (!header || !verifyPayMongoSignature(rawBody, header, opts.webhookSecret)) return null;
      let event: { data?: { id?: string; attributes?: { type?: string; data?: { id?: string } } } };
      try {
        event = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const eventId = event.data?.id;
      if (!eventId) return null;
      const type = event.data?.attributes?.type;
      const checkoutId = type === "checkout_session.payment.paid" ? (event.data?.attributes?.data?.id ?? null) : null;
      return { eventId, checkoutId };
    },
  };
}
