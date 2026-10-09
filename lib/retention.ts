/**
 * Data retention (design doc §15). The /privacy page quotes these numbers, so
 * change both together.
 */
import type { CleanupCutoffs } from "@/lib/rooms/store";

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_DAYS = {
  /** Rooms, players, answers, scores and Wrapped reports, counted from the room's expiry. */
  rooms: 30,
  /** Which questions a browser has seen — keeps repeats away for regular groups. */
  questionHistory: 365,
  /** Anonymous usage events (no names, no answers). */
  events: 395,
  /** Payment provider webhook ids (only used to ignore retries). */
  paymentEvents: 90,
  /** Ratings and comments players leave after a game. */
  feedback: 395,
} as const;

export function retentionCutoffs(now: Date): CleanupCutoffs {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  return {
    rooms: before(RETENTION_DAYS.rooms),
    questionHistory: before(RETENTION_DAYS.questionHistory),
    events: before(RETENTION_DAYS.events),
    paymentEvents: before(RETENTION_DAYS.paymentEvents),
    feedback: before(RETENTION_DAYS.feedback),
  };
}
