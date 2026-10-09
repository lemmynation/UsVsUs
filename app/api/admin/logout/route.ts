import { NextResponse } from "next/server";
import { logOutAdmin } from "@/lib/admin";

export async function POST(request: Request) {
  await logOutAdmin();
  return NextResponse.redirect(new URL("/admin/metrics", request.url), 303);
}
