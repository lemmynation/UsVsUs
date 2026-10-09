import { createHmac, timingSafeEqual } from "node:crypto";

/** Shorter tokens are ignored (admin stays off): they'd be guessable. */
export const MIN_ADMIN_TOKEN_LENGTH = 16;

export function usableAdminToken(value: string | undefined): string | null {
  const token = value?.trim();
  return token && token.length >= MIN_ADMIN_TOKEN_LENGTH ? token : null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The admin cookie holds this, never the token itself. Changing the token logs everyone out. */
export function adminCookieValue(token: string): string {
  return createHmac("sha256", token).update("uvu-admin-v1").digest("base64url");
}

export function isCorrectAdminToken(token: string, attempt: string): boolean {
  return safeEqual(adminCookieValue(token), adminCookieValue(attempt));
}

export function isValidAdminCookie(token: string, cookie: string | undefined): boolean {
  return typeof cookie === "string" && safeEqual(adminCookieValue(token), cookie);
}
