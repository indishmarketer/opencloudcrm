import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { syncGoogleReviews } from "@/lib/googleBusiness";

export async function POST() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await syncGoogleReviews()) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Google sync failed" }, { status: 502 }); }
}
