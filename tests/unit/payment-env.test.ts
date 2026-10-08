import { describe, expect, it } from "vitest";
import { resolvePaymentEnv } from "@/lib/premium/payment-env";

const dev = { production: false, memoryStore: false };
const prod = { production: true, memoryStore: false };

describe("resolvePaymentEnv", () => {
  it("hides premium when nothing is configured", () => {
    expect(resolvePaymentEnv({}, dev)).toEqual({ provider: "none" });
    expect(resolvePaymentEnv({ PAYMONGO_SECRET_KEY: " " }, dev)).toEqual({ provider: "none" });
  });

  it("uses PayMongo test keys in development", () => {
    expect(resolvePaymentEnv({ PAYMONGO_SECRET_KEY: "sk_test_abc", PAYMONGO_WEBHOOK_SECRET: "whsk_1" }, dev)).toEqual({
      provider: "paymongo",
      secretKey: "sk_test_abc",
      webhookSecret: "whsk_1",
      live: false,
      appUrl: null,
    });
  });

  it("refuses a live key outside production (no real charges while developing)", () => {
    expect(() => resolvePaymentEnv({ PAYMONGO_SECRET_KEY: "sk_live_abc" }, dev)).toThrow(/only allowed in production/);
  });

  it("requires APP_URL in production, and trims a trailing slash", () => {
    expect(() => resolvePaymentEnv({ PAYMONGO_SECRET_KEY: "sk_live_abc" }, prod)).toThrow(/APP_URL/);
    expect(
      resolvePaymentEnv({ PAYMONGO_SECRET_KEY: "sk_live_abc", APP_URL: "https://usvsus.app/" }, prod),
    ).toMatchObject({ live: true, appUrl: "https://usvsus.app" });
  });

  it("rejects something that isn't a PayMongo secret key", () => {
    expect(() => resolvePaymentEnv({ PAYMONGO_SECRET_KEY: "pk_test_public" }, dev)).toThrow(/secret key/);
  });

  it("allows the fake checkout only for development and in-memory tests", () => {
    expect(resolvePaymentEnv({ PAYMENT_PROVIDER: "fake" }, dev)).toEqual({ provider: "fake" });
    expect(resolvePaymentEnv({ PAYMENT_PROVIDER: "fake" }, { production: true, memoryStore: true })).toEqual({
      provider: "fake",
    });
    expect(() => resolvePaymentEnv({ PAYMENT_PROVIDER: "fake" }, prod)).toThrow(/development and tests only/);
  });

  it("explains a half-configured PayMongo", () => {
    expect(() => resolvePaymentEnv({ PAYMENT_PROVIDER: "paymongo" }, dev)).toThrow(/needs PAYMONGO_SECRET_KEY/);
  });
});
