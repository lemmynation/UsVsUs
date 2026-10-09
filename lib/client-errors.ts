/** Sends a crash report from the phone. Deduped and capped so a crash loop can't flood the server. */
const MAX_REPORTS_PER_PAGE = 5;
const sent = new Set<string>();

export function reportClientError(kind: "error" | "unhandledrejection" | "boundary", error: unknown, digest?: string) {
  if (typeof window === "undefined" || sent.size >= MAX_REPORTS_PER_PAGE) return;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const key = `${kind}:${message}`;
  if (sent.has(key)) return;
  sent.add(key);
  const body = JSON.stringify({ kind, message: message.slice(0, 2000), path: window.location.pathname, digest });
  try {
    if (!navigator.sendBeacon?.("/api/errors", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch {
    // Reporting must never cause another error.
  }
}
