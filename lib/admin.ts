import "server-only";
import { cookies } from "next/headers";
import { adminCookieValue, isCorrectAdminToken, isValidAdminCookie, usableAdminToken } from "./admin-token";

/**
 * The private metrics page is behind a single shared token (ADMIN_TOKEN). With no
 * token set, every admin route behaves as if it doesn't exist.
 */
const COOKIE_NAME = "uvu_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function adminToken(): string | null {
  return usableAdminToken(process.env.ADMIN_TOKEN);
}

export async function isAdmin(): Promise<boolean> {
  const token = adminToken();
  return token !== null && isValidAdminCookie(token, (await cookies()).get(COOKIE_NAME)?.value);
}

/** For scheduled jobs: `Authorization: Bearer <ADMIN_TOKEN>`. */
export function hasAdminBearer(request: Request): boolean {
  const token = adminToken();
  const header = request.headers.get("authorization");
  const attempt = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return token !== null && attempt !== null && isCorrectAdminToken(token, attempt);
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set. */
export function hasCronBearer(request: Request): boolean {
  const secret = usableAdminToken(process.env.CRON_SECRET);
  const header = request.headers.get("authorization");
  const attempt = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return secret !== null && attempt !== null && isCorrectAdminToken(secret, attempt);
}

/** Sets the admin cookie if `attempt` is the token. Route Handlers only. */
export async function logInAdmin(attempt: string): Promise<boolean> {
  const token = adminToken();
  if (!token || !isCorrectAdminToken(token, attempt)) return false;
  (await cookies()).set(COOKIE_NAME, adminCookieValue(token), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return true;
}

export async function logOutAdmin(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
