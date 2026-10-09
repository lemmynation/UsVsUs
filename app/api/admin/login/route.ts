import { NextResponse } from "next/server";
import { adminToken, logInAdmin } from "@/lib/admin";
import { isRateLimitedShared } from "@/lib/api";

/** Plain form post from /admin/metrics, so it works without JavaScript. */
export async function POST(request: Request) {
  if (!adminToken()) return new NextResponse(null, { status: 404 });
  const back = (query = "") => NextResponse.redirect(new URL(`/admin/metrics${query}`, request.url), 303);
  if (await isRateLimitedShared(request, "adminLogin")) return back("?login=slow");

  let attempt = "";
  try {
    const value = (await request.formData()).get("token");
    if (typeof value === "string") attempt = value.slice(0, 500);
  } catch {
    // not a form: treated as a wrong token
  }
  return (await logInAdmin(attempt)) ? back() : back("?login=wrong");
}
