import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeRequest } from "@/lib/apiTokens";
import { getSiteTheme, saveSiteTheme } from "@/lib/siteTheme";
import { unauthorized } from "@/lib/pagesApi";

/** The site's color palette and sitewide gradients. Live on every page via
 * the root layout's inline <style> -- no rebuild or redeploy needed. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "site:read");
  if (!auth.ok) return unauthorized();
  return NextResponse.json({ theme: await getSiteTheme() });
}

/** Merges the given fields into the current theme -- send only what you
 * want to change. */
export async function PATCH(req: NextRequest) {
  const auth = await authorizeRequest(req, "site:write");
  if (!auth.ok) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const theme = await saveSiteTheme(body);
  revalidatePath("/", "layout");
  return NextResponse.json({ theme });
}
