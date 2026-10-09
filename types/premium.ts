/**
 * A pending payment is just an intent; only the server, after asking the
 * provider, can turn it into "paid" and unlock the pack for the room.
 * `duplicate` = paid, but the room already had the pack (refund it).
 */
export type PaymentStatus = "pending" | "paid" | "duplicate";
export type PaymentProviderName = "paymongo" | "fake";

export interface Payment {
  id: string;
  /** Null once the room has been cleaned up (paid records are kept). */
  roomId: string | null;
  packSlug: string;
  provider: PaymentProviderName;
  checkoutId: string | null;
  checkoutUrl: string | null;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: "PHP";
  status: PaymentStatus;
  createdByPlayerId: string | null;
  createdAt: string;
  paidAt: string | null;
}

/** Premium packs as a room member sees them. */
export interface PremiumView {
  /** False when no payment provider is configured: premium stays hidden. */
  enabled: boolean;
  packs: Array<{
    slug: string;
    name: string;
    emoji: string;
    tagline: string;
    perks: string[];
    price: string;
    unlocked: boolean;
  }>;
  /** A checkout was started and hasn't been confirmed yet. */
  pendingCheckout: boolean;
}
