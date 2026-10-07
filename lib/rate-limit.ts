/**
 * Fixed-window rate limiter kept in process memory.
 * Good enough for a single server / beta. On multi-instance or serverless
 * hosting each instance counts separately — move to a shared store (e.g.
 * Upstash Redis) before relying on it for abuse protection at scale.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export const LIMITS = {
  createRoom: { max: 10, windowMs: 60_000 },
  joinRoom: { max: 20, windowMs: 60_000 },
  roomAction: { max: 60, windowMs: 60_000 },
  roomState: { max: 120, windowMs: 60_000 },
  events: { max: 60, windowMs: 60_000 },
} as const;

export function rateLimit(bucket: keyof typeof LIMITS, key: string, now = Date.now()): boolean {
  const { max, windowMs } = LIMITS[bucket];
  const id = `${bucket}:${key}`;
  const entry = windows.get(id);
  if (!entry || entry.resetAt <= now) {
    windows.set(id, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    }
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

export function clientKey(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
