import { z } from "zod";

const paymentSchema = z.object({
  /** "fake" = the dev/test checkout (never in production). Defaults to PayMongo when its key is set. */
  PAYMENT_PROVIDER: z.enum(["paymongo", "fake"]).optional(),
  PAYMONGO_SECRET_KEY: z
    .string()
    .regex(/^sk_(test|live)_/, "must be a PayMongo secret key (sk_test_… or sk_live_…)")
    .optional(),
  PAYMONGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Public site address, e.g. https://usvsus.app. Required in production: checkout return links use it. */
  APP_URL: z.url().optional(),
});

export type PaymentEnv =
  | { provider: "none" }
  | { provider: "fake" }
  | { provider: "paymongo"; secretKey: string; webhookSecret: string | null; live: boolean; appUrl: string | null };

const blank = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : v);

/**
 * Decides the payment provider from settings. Pure, so every guard is unit-tested:
 * - the fake checkout never runs in production against a real database;
 * - a live key is refused outside production (no real charges while developing);
 * - production needs APP_URL, so return links never come from spoofable headers.
 */
export function resolvePaymentEnv(
  vars: Record<string, string | undefined>,
  context: { production: boolean; memoryStore: boolean },
): PaymentEnv {
  const parsed = paymentSchema.safeParse({
    PAYMENT_PROVIDER: blank(vars.PAYMENT_PROVIDER),
    PAYMONGO_SECRET_KEY: blank(vars.PAYMONGO_SECRET_KEY),
    PAYMONGO_WEBHOOK_SECRET: blank(vars.PAYMONGO_WEBHOOK_SECRET),
    APP_URL: blank(vars.APP_URL),
  });
  if (!parsed.success) throw new Error(`Invalid payment settings:\n${z.prettifyError(parsed.error)}`);
  const env = parsed.data;

  if (env.PAYMENT_PROVIDER === "fake") {
    if (context.production && !context.memoryStore) {
      throw new Error("PAYMENT_PROVIDER=fake is for local development and tests only.");
    }
    return { provider: "fake" };
  }
  if (env.PAYMONGO_SECRET_KEY) {
    const live = env.PAYMONGO_SECRET_KEY.startsWith("sk_live_");
    if (live && !context.production) {
      throw new Error("A live PayMongo key (sk_live_…) is only allowed in production.");
    }
    if (context.production && !env.APP_URL) {
      throw new Error("Set APP_URL (your public site address) to enable payments.");
    }
    return {
      provider: "paymongo",
      secretKey: env.PAYMONGO_SECRET_KEY,
      webhookSecret: env.PAYMONGO_WEBHOOK_SECRET ?? null,
      live,
      appUrl: env.APP_URL ? env.APP_URL.replace(/\/+$/, "") : null,
    };
  }
  if (env.PAYMENT_PROVIDER === "paymongo") throw new Error("PAYMENT_PROVIDER=paymongo needs PAYMONGO_SECRET_KEY.");
  return { provider: "none" };
}
