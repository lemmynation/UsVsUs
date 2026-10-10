import "server-only";
import { cookies } from "next/headers";
import { generateSessionToken, hashSessionToken, isValidSessionToken } from "./session-token";

const COOKIE_NAME = "uvu_session";
/**
 * About a year (browsers cap cookies at 400 days). The cookie is renewed whenever
 * the player creates, joins, starts or rematches a room, so an active phone keeps
 * its identity, and with it the packs it bought ("packs follow your phone").
 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Read-only lookup, usable from Server Components. */
export async function readSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return isValidSessionToken(token) ? hashSessionToken(token) : null;
}

/** Like `readSessionHash`, and pushes the cookie's expiry out again. Route Handlers only. */
export async function readSessionHashAndRenew(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!isValidSessionToken(token)) return null;
  await setSessionCookie(token);
  return hashSessionToken(token);
}

/** Returns the caller's session hash, issuing a new cookie (or renewing the old one). Route Handlers only. */
export async function getOrCreateSessionHash(): Promise<string> {
  const existing = (await cookies()).get(COOKIE_NAME)?.value;
  if (isValidSessionToken(existing)) {
    await setSessionCookie(existing);
    return hashSessionToken(existing);
  }
  const token = generateSessionToken();
  await setSessionCookie(token);
  return hashSessionToken(token);
}
