import { NextResponse } from "next/server";
import { adminToken, hasAdminBearer, hasCronBearer, isAdmin } from "@/lib/admin";
import { retentionCutoffs } from "@/lib/retention";
import { getRoomStore } from "@/lib/rooms/server";

/**
 * Runs the retention cleanup (design doc §15).
 * - GET: the daily scheduled job (vercel.json), `Authorization: Bearer <CRON_SECRET>`.
 * - POST: the metrics page's button (admin cookie, same-site form post), or any
 *   job with `Authorization: Bearer <ADMIN_TOKEN>`.
 */
async function cleanup() {
  const result = await getRoomStore().cleanupExpiredData(retentionCutoffs(new Date()));
  console.info("[retention] cleanup", result);
  return result;
}

export async function GET(request: Request) {
  if (!hasCronBearer(request) && !hasAdminBearer(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await cleanup());
}

export async function POST(request: Request) {
  if (!adminToken()) return new NextResponse(null, { status: 404 });
  const bearer = hasAdminBearer(request);
  if (!bearer && !(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await cleanup();
  if (bearer) return NextResponse.json(result);
  const query = new URLSearchParams({
    cleaned: "1",
    ...Object.fromEntries(Object.entries(result).map(([k, v]) => [k, String(v)])),
  });
  return NextResponse.redirect(new URL(`/admin/metrics?${query}`, request.url), 303);
}
