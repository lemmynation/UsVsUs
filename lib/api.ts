import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { ROOM_ERRORS } from "@/lib/rooms/errors";
import { createHash } from "node:crypto";
import { clientKey, disabledForTests, rateLimit, LIMITS } from "@/lib/rate-limit";
import { getRoomStore } from "@/lib/rooms/server";

export function apiError(code: string): NextResponse {
  const known = ROOM_ERRORS[code] ?? { status: 500, message: "Something went wrong." };
  return NextResponse.json({ error: code, message: known.message }, { status: known.status });
}

/** Parses a JSON body against a schema. Returns null on any problem. */
export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | null> {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Room state and room actions are limited per player (IP + session cookie):
 * a whole Circle on one home Wi-Fi shares a single IP and polls together.
 * Create/join stay per IP to slow down room spam from one source.
 */
export function isRateLimited(request: Request, bucket: keyof typeof LIMITS, sessionHash?: string | null): boolean {
  const key = sessionHash ? `${clientKey(request.headers)}:${sessionHash}` : clientKey(request.headers);
  return !rateLimit(bucket, key);
}

/** Buckets worth counting across every server instance (abuse and cost), not just this one. */
export type SharedBucket =
  "createRoom" | "joinRoom" | "checkout" | "adminLogin" | "createDisplay" | "pairDisplay" | "pairDisplayRoom";

/**
 * Like `isRateLimited`, but counted in the database so the limit holds when the
 * host runs many copies of the server. Keyed per IP (+ session when given), stored
 * only as a hash. If the database can't be reached, falls back to this instance's
 * own count rather than blocking players. `by` counts something other than the
 * caller instead (e.g. a room, whoever is knocking).
 */
export async function isRateLimitedShared(
  request: Request,
  bucket: SharedBucket,
  sessionHash?: string | null,
  { by }: { by?: string } = {},
): Promise<boolean> {
  if (disabledForTests) return false;
  const who = by ?? (sessionHash ? `${clientKey(request.headers)}:${sessionHash}` : clientKey(request.headers));
  const { max, windowMs } = LIMITS[bucket];
  const key = createHash("sha256").update(`${bucket}|${who}`).digest("hex");
  try {
    return !(await getRoomStore().hitRateLimit(key, max, windowMs, new Date().toISOString()));
  } catch (error) {
    console.error("[rate-limit] shared limiter unavailable, using local count", error);
    return !rateLimit(bucket, who);
  }
}
