import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { ROOM_ERRORS } from "@/lib/rooms/errors";
import { clientKey, rateLimit, LIMITS } from "@/lib/rate-limit";

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
