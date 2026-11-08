import { NextResponse } from "next/server";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { API_SCOPES } from "@/lib/apiScopes";

export const dynamic = "force-static";

/** RFC 9728 protected-resource metadata for the /api/mcp resource --
 * points a client at the authorization server above. Our /api/mcp
 * route's 401 response's WWW-Authenticate header links here, which is
 * how a client finds this URL without it being hardcoded on their end. */
export async function GET() {
  const base = SITE_URL.replace(/\/$/, "");
  return NextResponse.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: [...API_SCOPES, "*"],
    resource_name: SITE_NAME,
  });
}
