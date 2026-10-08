import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * `Paymongo-Signature: t=<timestamp>,te=<test sig>,li=<live sig>` — an
 * HMAC-SHA256 (hex) of `<timestamp>.<raw body>` with the webhook's secret.
 * Whichever of te/li is present is compared, in constant time. A replay is
 * harmless anyway: a webhook only makes the server re-check with PayMongo.
 */
export function verifyPayMongoSignature(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const timestamp = parts.t;
  const given = parts.li || parts.te;
  if (!timestamp || !given) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
