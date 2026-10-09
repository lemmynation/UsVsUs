import { NextResponse } from "next/server";
import { adminToken, hasAdminBearer, isAdmin } from "@/lib/admin";
import { retentionCutoffs } from "@/lib/retention";
import { getRoomStore } from "@/lib/rooms/server";

/**
 * Runs the retention cleanup (design doc §15). Called from the metrics page's
 * button (admin cookie, a same-site form post) or by a scheduled job with
 * `Authorization: Bearer <ADMIN_TOKEN>`, which gets the counts back as JSON.
 */
export async function POST(request: Request) {
  if (!adminToken()) return new NextResponse(null, { status: 404 });
  const bearer = hasAdminBearer(request);
  if (!bearer && !(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await getRoomStore().cleanupExpiredData(retentionCutoffs(new Date()));
  console.info("[retention] cleanup", result);
  if (bearer) return NextResponse.json(result);
  const query = new URLSearchParams({
    cleaned: "1",
    ...Object.fromEntries(Object.entries(result).map(([k, v]) => [k, String(v)])),
  });
  return NextResponse.redirect(new URL(`/admin/metrics?${query}`, request.url), 303);
}
