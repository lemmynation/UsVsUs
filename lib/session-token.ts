import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, base64url — 43 characters. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidSessionToken(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Only the hash is stored, so a database leak can't be replayed as cookies. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Short, non-reversible id for analytics so events never hold the full hash. */
export function analyticsIdFromHash(sessionTokenHash: string): string {
  return createHash("sha256").update(`analytics:${sessionTokenHash}`).digest("hex").slice(0, 16);
}
