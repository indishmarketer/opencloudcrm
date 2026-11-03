import { NextRequest, NextResponse } from "next/server";
import { registerOAuthClient } from "@/lib/oauth";
import { checkRateLimit } from "@/lib/rateLimit";

function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Dynamic client registration (RFC 7591), the minimum subset MCP
 * clients need: register a redirect_uri list, get back a client_id.
 * Public client only -- no client_secret is ever issued, PKCE is the
 * actual security boundary at /authorize and /token. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`oauth-register:${ip}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const redirectUris = body?.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every(isAllowedRedirectUri)) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "redirect_uris must be a non-empty array of https:// URLs." },
      { status: 400 }
    );
  }

  const client = await registerOAuthClient(redirectUris);
  return NextResponse.json({
    client_id: client.clientId,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  });
}
