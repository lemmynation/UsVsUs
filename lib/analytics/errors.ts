import "server-only";
import { track } from "./server";
import { sanitizeErrorText, sanitizePath } from "./sanitize";

/** Records a server error for the health dashboard. Never throws. */
export async function recordServerError(
  error: unknown,
  info: { path: string; routeType?: string; method?: string },
): Promise<void> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : null;
  await track("server_error", {
    properties: {
      message: sanitizeErrorText(message),
      path: sanitizePath(info.path),
      routeType: info.routeType ?? null,
      method: info.method ?? null,
      digest,
    },
  });
}

/** Times an API route call for the p95 latency metric (doc §14 technical health). */
export async function recordTiming(route: string, startedAt: number, status: number): Promise<void> {
  await track("api_timing", { properties: { route, ms: Math.round(performance.now() - startedAt), status } });
}
