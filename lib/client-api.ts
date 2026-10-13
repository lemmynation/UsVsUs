import { errorMessage } from "@/lib/rooms/errors";
import type { ClientEventName } from "@/lib/analytics/events";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** POST/GET JSON to our own API and turn error responses into ApiError with friendly copy. */
export async function apiFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", "You seem to be offline. Check your connection and try again.");
  }
  if (res.ok) return (res.status === 204 ? null : await res.json()) as T;

  const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  const code = data?.error ?? "unknown";
  throw new ApiError(code, data?.message ?? errorMessage(code));
}

export function trackClient(
  name: ClientEventName,
  properties?: Record<string, string | number | boolean>,
  roomId?: string,
) {
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, properties, roomId }),
    keepalive: true,
  }).catch(() => {});
}
