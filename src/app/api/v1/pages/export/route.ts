import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { exportPages } from "@/lib/sitePages";
import { readSiteChrome } from "@/lib/siteChrome";
import { readStoredBusinessProfile } from "@/lib/businessProfile";
import { pageErrorResponse, unauthorized } from "@/lib/pagesApi";

/** Every page plus the navigation/footer and business details, as one
 * file another deployment can import (Console -> Pages -> Import). */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "pages:read");
  if (!auth.ok) return unauthorized();
  try {
    const [{ chrome, saved }, business] = await Promise.all([readSiteChrome(), readStoredBusinessProfile()]);
    const data = await exportPages({
      ...(saved ? { navigation: chrome } : {}),
      ...(business.source !== "empty" ? { business: business.profile } : {}),
    });
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="pages-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return pageErrorResponse(error);
  }
}
