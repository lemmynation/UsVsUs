import type { Instrumentation } from "next";

/**
 * Built-in error monitoring (Phase 6): every server error Next.js captures —
 * pages, API routes, proxy — is recorded for the metrics dashboard, scrubbed of
 * personal data. Node runtime only; the app doesn't use the edge runtime.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordServerError } = await import("./lib/analytics/errors");
  await recordServerError(error, { path: request.path, method: request.method, routeType: context.routeType });
};
