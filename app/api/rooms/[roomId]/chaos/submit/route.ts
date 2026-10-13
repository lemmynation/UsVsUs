import { MAX_ARTIFACT_BYTES } from "@/lib/chaos/artifact";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { chainReactionsEnabled } from "@/lib/env";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getChaosService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";
import { timed } from "@/lib/timing";

/** Shape only; the service checks the job, the choices and the drawing itself. */
const bodySchema = z.object({
  step: z.number().int().min(1).max(10),
  chain: z.number().int().min(0).max(9),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  artifact: z.unknown().optional(),
  answer: z.object({ objectId: z.string().max(64).optional(), mutationId: z.string().max(64).optional() }).optional(),
});

/** One of the caller's jobs for the open step: a drawing/text, or a detect answer. Safe to retry. */
async function handlePOST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/chaos/submit">) {
  if (!chainReactionsEnabled()) return apiError("feature_off");
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  // A drawing is at most 64 KB; refuse anything far bigger before parsing it.
  if (Number(request.headers.get("content-length") ?? 0) > 2 * MAX_ARTIFACT_BYTES)
    return apiError("artifact_too_large");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getChaosService().submit(roomId, sessionHash, body);
  if (!result.ok) return apiError(result.error);
  if (!result.value.duplicate) {
    // Everyone learns *that* someone finished a job, never what they made.
    const medium =
      body.answer !== undefined
        ? "answer"
        : (body.artifact as { medium?: string } | undefined)?.medium === "text"
          ? "text"
          : "drawing";
    await Promise.all([
      notifyRoomChanged(roomId),
      track("contribution_submitted", {
        sessionHash,
        roomId,
        properties: { step: body.step, medium, secondsTaken: result.value.secondsTaken },
      }),
    ]);
  }
  return NextResponse.json({ ok: true });
}

export const POST = timed("chaos_submit", handlePOST);
