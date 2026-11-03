import { NextResponse } from "next/server";
import { SITE_URL } from "@/config/brand";
import { API_SCOPES } from "@/lib/apiScopes";

export const dynamic = "force-static";

/** RFC 8414 authorization server metadata -- lets any OAuth/MCP client
 * discover our endpoints by URL alone. This server only issues
 * authorization codes via PKCE (public clients, no client_secret). */
export async function GET() {
  const base = SITE_URL.replace(/\/$/, "");
  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...API_SCOPES, "*"],
  });
}
