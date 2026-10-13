/**
 * Party Screen pairing rules (docs/usvsus-4/07). The TV shows a short code; the host's
 * phone types it. Codes use the join-code alphabet (no 0/O/1/I/L), last 5 minutes, work
 * once, and only their hash is stored.
 */
import { createHash } from "node:crypto";
import { generateJoinCode, normalizeJoinCode } from "@/lib/rooms/rules";

export const PAIRING_CODE_TTL_MS = 5 * 60_000;
export const MAX_DISPLAYS_PER_ROOM = 2;
/** A TV seen this recently counts as connected on the host's phone. */
export const DISPLAY_ONLINE_MS = 30_000;
/** How often a polling TV's "last seen" is written (saves a write on most polls). */
export const DISPLAY_TOUCH_MS = 15_000;

export const generatePairingCode = generateJoinCode;
export const normalizePairingCode = normalizeJoinCode;

export function hashPairingCode(code: string): string {
  return createHash("sha256").update(`party-code:${code}`).digest("hex");
}
