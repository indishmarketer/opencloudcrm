import crypto from "crypto";
import { pool } from "@/lib/db";
import { getAdminSessionEmail } from "@/lib/auth";
import { type ApiScope } from "@/lib/apiScopes";

export { API_SCOPES, type ApiScope } from "@/lib/apiScopes";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Returns the plaintext token (shown once to the caller) plus what gets
 * stored in the DB. Never store the plaintext. */
export function generateToken(): { token: string; hash: string; prefix: string } {
  const token = "imk_" + crypto.randomBytes(24).toString("hex");
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) };
}

function hasScope(tokenScopes: string[], required: ApiScope): boolean {
  return tokenScopes.includes("*") || tokenScopes.includes(required);
}

/** Returns the token's row id on success (truthy, and useful for
 * attribution), or false if the token is missing/invalid/revoked/lacks
 * the required scope. */
export async function validateToken(req: Request, requiredScope: ApiScope): Promise<number | false> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return false;

  const result = await pool.query(
    "SELECT id, scopes FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL",
    [hashToken(token)]
  );
  if (result.rows.length === 0) return false;
  if (!hasScope(result.rows[0].scopes, requiredScope)) return false;

  const id = result.rows[0].id;
  await pool.query("UPDATE api_tokens SET last_used_at = now() WHERE id = $1", [id]);
  return id;
}

/** For /api/v1/* routes meant to work for both the console's own admin
 * session (cookie) and a self-hoster's API token (Bearer header) -- the
 * same endpoint serves the console UI and external/MCP callers. Checks
 * the session first since it's already-verified and cheaper than a DB
 * round trip. */
export async function authorizeRequest(
  req: Request,
  requiredScope: ApiScope
): Promise<{ ok: true; via: "session"; email: string } | { ok: true; via: "token"; tokenId: number } | { ok: false }> {
  const adminEmail = await getAdminSessionEmail();
  if (adminEmail) return { ok: true, via: "session", email: adminEmail };

  const tokenId = await validateToken(req, requiredScope);
  return tokenId !== false ? { ok: true, via: "token", tokenId } : { ok: false };
}
