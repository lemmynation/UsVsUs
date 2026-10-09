import { NextResponse } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { sanitizeErrorText, sanitizePath } from "@/lib/analytics/sanitize";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { readSessionHash } from "@/lib/session";

const bodySchema = z.object({
  kind: z.enum(["error", "unhandledrejection", "boundary"]),
  message: z.string().max(2000),
  path: z.string().max(500),
  digest: z.string().max(100).nullish(),
});

/** Crash reports from phones (built-in error monitoring). Scrubbed and rate-limited. */
export async function POST(request: Request) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "events", sessionHash)) return apiError("rate_limited");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");
  await track("client_error", {
    sessionHash,
    properties: {
      kind: body.kind,
      message: sanitizeErrorText(body.message),
      path: sanitizePath(body.path),
      digest: body.digest ?? null,
    },
  });
  return new NextResponse(null, { status: 204 });
}
