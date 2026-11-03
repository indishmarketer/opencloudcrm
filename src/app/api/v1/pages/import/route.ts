import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeRequest } from "@/lib/apiTokens";
import { importPages } from "@/lib/sitePages";
import { saveSiteChrome } from "@/lib/siteChrome";
import { saveBusinessProfile } from "@/lib/businessProfile";
import { normalizeSiteChrome } from "@/lib/siteChromeShape";
import { normalizeBusinessProfile, validateBusinessProfile } from "@/lib/businessProfileShape";
import { actorOf, pageErrorResponse, unauthorized } from "@/lib/pagesApi";

/** Imports a file from GET /api/v1/pages/export: pages are created or
 * replaced by address; the navigation and business details in the file
 * (if any) replace the current ones. */
export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, "pages:write");
  if (!auth.ok) return unauthorized();
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > 5 * 1024 * 1024) return NextResponse.json({ error: "That file is too large (5 MB max)." }, { status: 413 });
  const file = await req.json().catch(() => null);
  try {
    const pages = await importPages(file, actorOf(auth));
    const data = file as Record<string, unknown>;
    let navigation = false;
    let business = false;
    if (data.navigation && typeof data.navigation === "object") {
      await saveSiteChrome(normalizeSiteChrome(data.navigation));
      navigation = true;
    }
    if (data.business && typeof data.business === "object") {
      const profile = normalizeBusinessProfile(data.business);
      if (!validateBusinessProfile(profile)) {
        await saveBusinessProfile(profile);
        business = true;
      }
    }
    revalidatePath("/", "layout");
    return NextResponse.json({ pages, navigation, business });
  } catch (error) {
    return pageErrorResponse(error);
  }
}
