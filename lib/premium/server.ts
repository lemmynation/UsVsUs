import "server-only";
import { getPaymentEnv } from "@/lib/env";
import { getRoomStore } from "@/lib/rooms/server";
import { FakePaymentProvider } from "./fake-provider";
import { createPayMongoProvider } from "./paymongo";
import type { PaymentProvider } from "./provider";
import { createPremiumService, type PremiumService } from "./service";

// One fake provider per server process (its checkouts live in memory), surviving dev hot reloads.
const globalForFake = globalThis as unknown as { __usVsUsFakeProvider?: FakePaymentProvider };

export function getFakeProvider(): FakePaymentProvider | null {
  if (getPaymentEnv().provider !== "fake") return null;
  globalForFake.__usVsUsFakeProvider ??= new FakePaymentProvider();
  return globalForFake.__usVsUsFakeProvider;
}

export function getPaymentProvider(): PaymentProvider | null {
  const env = getPaymentEnv();
  if (env.provider === "fake") return getFakeProvider();
  if (env.provider === "paymongo") {
    return createPayMongoProvider({ secretKey: env.secretKey, webhookSecret: env.webhookSecret });
  }
  return null;
}

export function getPremiumService(): PremiumService {
  return createPremiumService({ store: getRoomStore(), provider: getPaymentProvider(), now: () => new Date() });
}

/**
 * Where checkout should send players back to. In production this is the
 * configured APP_URL — never the request's Host header, which can be spoofed to
 * bounce a paying player to a look-alike site.
 */
export function checkoutReturnOrigin(requestOrigin: string): string {
  const env = getPaymentEnv();
  return env.provider === "paymongo" && env.appUrl ? env.appUrl : requestOrigin;
}
