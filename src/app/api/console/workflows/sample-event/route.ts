import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { latestEventSample } from "@/lib/workflows";

/** The latest real occurrence of a workflow event, so the canvas can show
 * which fields it carries and offer them as {{…}} merge fields. */
export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const eventKey = req.nextUrl.searchParams.get("eventKey") || "";
  return NextResponse.json({ sample: await latestEventSample(eventKey) });
}
