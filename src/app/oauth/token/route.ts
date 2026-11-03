import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { generateToken } from "@/lib/apiTokens";
import { redeemAuthorizationCode, verifyPkce } from "@/lib/oauth";

/** Exchanges an authorization code for an access token. Per RFC 6749 the
 * request body is application/x-www-form-urlencoded. The "access token"
 * this hands back is a brand-new ordinary api_tokens row -- same type
 * /console/api-tokens issues, verified the exact same way everywhere
 * else in the app, and revocable from that same console page. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  if (form.get("grant_type") !== "authorization_code") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }

  const code = String(form.get("code") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const clientId = String(form.get("client_id") || "");
  const codeVerifier = String(form.get("code_verifier") || "");

  const grant = code ? await redeemAuthorizationCode(code) : null;
  if (!grant) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  if (grant.clientId !== clientId || grant.redirectUri !== redirectUri) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (!codeVerifier || !verifyPkce(codeVerifier, grant.codeChallenge)) {
    return NextResponse.json({ error: "invalid_grant", error_description: "PKCE verification failed." }, { status: 400 });
  }

  const redirectHost = new URL(grant.redirectUri).host;
  const { token, hash, prefix } = generateToken();
  await pool.query(
    "INSERT INTO api_tokens (label, scopes, token_hash, key_prefix, created_by, issued_via) VALUES ($1, $2, $3, $4, $5, 'oauth')",
    [`OAuth: ${redirectHost}`, grant.scopes, hash, prefix, grant.adminEmail]
  );

  return NextResponse.json({ access_token: token, token_type: "bearer", scope: grant.scopes.join(" ") });
}
