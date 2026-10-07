import { NextResponse } from "next/server";
import { z } from "zod";
import { CLIENT_EVENTS } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { readSessionHash } from "@/lib/session";

const bodySchema = z.object({
  name: z.enum(CLIENT_EVENTS),
  roomId: z.uuid().nullish(),
  properties: z.record(z.string().max(40), z.union([z.string().max(100), z.number(), z.boolean()])).optional(),
});

export async function POST(request: Request) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "events", sessionHash)) return apiError("rate_limited");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");

  await track(body.name, { sessionHash, roomId: body.roomId, properties: body.properties });
  return new NextResponse(null, { status: 204 });
}
