import type { Pack } from "./catalog";
import type { PaymentProviderName } from "@/types/premium";

/** What the provider says about a checkout, fetched fresh by the server. */
export interface CheckoutStatus {
  paid: boolean;
  amountMinor: number | null;
  currency: string | null;
  providerPaymentId: string | null;
  /** Our payment id, echoed back from the checkout's metadata. */
  paymentRef: string | null;
}

/**
 * Payment provider boundary (design doc §8): game logic never talks to a gateway
 * directly. Nothing a provider *sends* us is trusted on its own — a webhook only
 * prompts the server to ask the provider again with `getCheckout`.
 */
export interface PaymentProvider {
  name: PaymentProviderName;
  createCheckout(input: {
    paymentId: string;
    roomId: string;
    pack: Pack;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutId: string; checkoutUrl: string }>;
  getCheckout(checkoutId: string): Promise<CheckoutStatus>;
  /** Authenticates a webhook. Null if the signature is wrong; checkoutId null for events we don't use. */
  parseWebhook(rawBody: string, headers: Headers): Promise<{ eventId: string; checkoutId: string | null } | null>;
}
