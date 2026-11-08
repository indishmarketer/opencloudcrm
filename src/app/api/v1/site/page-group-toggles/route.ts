import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { getPageGroupToggles, savePageGroupToggles } from "@/lib/pageGroupToggles";
import { unauthorized } from "@/lib/pagesApi";

/** Whole-site-section on/off switches: courses, webinars, reviews, tools
 * directory, newsletter, meetings, refund policy. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "site:read");
  if (!auth.ok) return unauthorized();
  return NextResponse.json({ toggles: await getPageGroupToggles() });
}

/** Merges the given groups into current toggle state -- send only the
 * groups you want to change. */
export async function PATCH(req: NextRequest) {
  const auth = await authorizeRequest(req, "site:write");
  if (!auth.ok) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const toggles = await savePageGroupToggles(body);
  return NextResponse.json({ toggles });
}
