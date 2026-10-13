import "server-only";
import { cookies } from "next/headers";
import { hashSessionToken, isValidSessionToken } from "@/lib/session-token";

/** The TV's own cookie. Read-only access to one room's spectator view, nothing else. */
const COOKIE_NAME = "uvu_display";
/** A week: long enough for a TV left on a shelf; what it may see is decided on the server. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function setDisplayCookie(token: string) {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readDisplayHash(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return isValidSessionToken(token) ? hashSessionToken(token) : null;
}
