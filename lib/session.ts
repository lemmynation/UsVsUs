import "server-only";
import { cookies } from "next/headers";
import { generateSessionToken, hashSessionToken, isValidSessionToken } from "./session-token";

const COOKIE_NAME = "uvu_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Read-only lookup, usable from Server Components. */
export async function readSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return isValidSessionToken(token) ? hashSessionToken(token) : null;
}

/** Returns the caller's session hash, issuing a new cookie if needed. Route Handlers only. */
export async function getOrCreateSessionHash(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (isValidSessionToken(existing)) return hashSessionToken(existing);

  const token = generateSessionToken();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return hashSessionToken(token);
}
