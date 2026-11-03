import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getCachedAnalytics, refreshAllAnalytics } from "@/lib/analyticsSources";

/** Returns the last dump on file, no external API calls -- this is what
 * the analytics page loads by default so there's always something to
 * show, never a "click to load" empty state. */
export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ga4, searchConsole, bing } = await getCachedAnalytics();
  return NextResponse.json({ ga4, searchConsole, bing });
}

/** Only called when the owner clicks "Refresh" -- these platforms have
 * real rate/quota limits, so nothing here ever
 * runs on a schedule or on an ordinary page view. */
export async function POST() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await refreshAllAnalytics();
  return NextResponse.json(data);
}
