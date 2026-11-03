import { randomUUID, createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { pool } from "@/lib/db";
import { getSessionSecret, consumeJti } from "@/lib/auth";
import { type GrantedScope } from "@/lib/apiScopes";

const secret = () => new TextEncoder().encode(getSessionSecret());

export type OAuthClient = { clientId: string; redirectUris: string[] };

/** Registers a new public OAuth client (Claude.ai or any other MCP
 * client doing dynamic client registration). No client_secret -- these
 * are public clients, PKCE is the actual security boundary. */
export async function registerOAuthClient(redirectUris: string[]): Promise<OAuthClient> {
  const clientId = randomUUID();
  await pool.query("INSERT INTO oauth_clients (client_id, redirect_uris) VALUES ($1, $2)", [clientId, redirectUris]);
  return { clientId, redirectUris };
}

export async function getOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const result = await pool.query<{ client_id: string; redirect_uris: string[] }>(
    "SELECT client_id, redirect_uris FROM oauth_clients WHERE client_id = $1",
    [clientId]
  );
  if (!result.rows[0]) return null;
  return { clientId: result.rows[0].client_id, redirectUris: result.rows[0].redirect_uris };
}

/** A registered redirect_uri is only ever matched exactly -- no prefix or
 * origin-only matching. This is the core OAuth anti-takeover control;
 * loosening it to a prefix/origin match would let any path on the
 * client's own domain receive the code. */
export function isRegisteredRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCE S256 check: the verifier the client presents at /token must hash
 * to the challenge it presented at /authorize. `plain` is intentionally
 * not supported anywhere in this flow. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  return base64url(createHash("sha256").update(codeVerifier).digest()) === codeChallenge;
}

type AuthCodePayload = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: GrantedScope[];
  adminEmail: string;
};

/** The authorization "code" is a short-lived, single-use signed JWT --
 * same primitive this app already uses for magic links/password resets
 * (src/lib/auth.ts), just carrying OAuth fields instead. Avoids a
 * separate codes table. */
export async function createAuthorizationCode(payload: AuthCodePayload): Promise<string> {
  return new SignJWT({ purpose: "oauth-code", jti: randomUUID(), ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(secret());
}

/** Verifies and consumes (single-use) an authorization code. Returns the
 * embedded grant details, or null if invalid, expired, or already used. */
export async function redeemAuthorizationCode(code: string): Promise<AuthCodePayload | null> {
  try {
    const { payload } = await jwtVerify(code, secret());
    if (payload.purpose !== "oauth-code") return null;
    if (typeof payload.jti !== "string" || !(await consumeJti(payload.jti))) return null;
    const { clientId, redirectUri, codeChallenge, scopes, adminEmail } = payload as Record<string, unknown>;
    if (
      typeof clientId !== "string" ||
      typeof redirectUri !== "string" ||
      typeof codeChallenge !== "string" ||
      typeof adminEmail !== "string" ||
      !Array.isArray(scopes)
    ) {
      return null;
    }
    return { clientId, redirectUri, codeChallenge, scopes: scopes as GrantedScope[], adminEmail };
  } catch {
    return null;
  }
}
