import "server-only";
import { after } from "next/server";
import { recordTiming } from "@/lib/analytics/errors";

/**
 * Wraps a route handler to record how long it took (doc §14: p95 latency). The
 * record is written after the response is sent, so timing never slows a player.
 * `sampleRate` keeps high-volume routes (the room refresh poll) cheap.
 */
export function timed<A extends unknown[]>(
  route: string,
  handler: (...args: A) => Promise<Response>,
  sampleRate = 1,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const startedAt = performance.now();
    const response = await handler(...args);
    if (sampleRate >= 1 || Math.random() < sampleRate) {
      after(() => recordTiming(route, startedAt, response.status));
    }
    return response;
  };
}
