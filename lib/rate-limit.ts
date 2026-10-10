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
  adminLogin: { max: 5, windowMs: 15 * 60_000 },
  checkout: { max: 10, windowMs: 10 * 60_000 },
  // Per player: enough for a burst of laughing, not enough to flood everyone's screen.
  reaction: { max: 12, windowMs: 10_000 },
} as const;

/**
 * E2E runs every simulated phone from one IP, so the per-IP room-creation limit
 * trips during a full parallel suite. Tests can switch limits off — in dev, or in a
 * production build only together with the in-memory store (never used for real
 * players). A real deployment can't turn them off.
 */
export const disabledForTests =
  process.env.RATE_LIMITS === "off" && (process.env.NODE_ENV !== "production" || process.env.ROOM_STORE === "memory");

export function rateLimit(bucket: keyof typeof LIMITS, key: string, now = Date.now()): boolean {
  if (disabledForTests) return true;
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
