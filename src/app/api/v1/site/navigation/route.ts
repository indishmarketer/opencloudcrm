import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeRequest } from "@/lib/apiTokens";
import { readSiteChrome, saveSiteChrome } from "@/lib/siteChrome";
import { normalizeSiteChrome } from "@/lib/siteChromeShape";
import { unauthorized } from "@/lib/pagesApi";

/** The header menu, header button, footer columns/tagline and social links. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "site:read");
  if (!auth.ok) return unauthorized();
  return NextResponse.json(await readSiteChrome());
}

/** Replaces the whole navigation. Send everything (GET it first). */
export async function PUT(req: NextRequest) {
  const auth = await authorizeRequest(req, "site:write");
  if (!auth.ok) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const chrome = normalizeSiteChrome(body);
  await saveSiteChrome(chrome);
  revalidatePath("/", "layout");
  return NextResponse.json({ chrome, saved: true });
}
