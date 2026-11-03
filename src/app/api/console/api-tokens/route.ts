import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";
import { generateToken } from "@/lib/apiTokens";
import { API_SCOPES } from "@/lib/apiScopes";

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `SELECT id, label, scopes, key_prefix, created_by, created_at, last_used_at, revoked_at, issued_via
     FROM api_tokens ORDER BY created_at DESC`
  );
  return NextResponse.json({ keys: result.rows });
}

export async function POST(req: NextRequest) {
  const email = await getAdminSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { label, scopes } = await req.json().catch(() => ({}));
  if (!label || typeof label !== "string") {
    return NextResponse.json({ error: "A label is required, so you can tell keys apart later." }, { status: 400 });
  }
  const validScopes: readonly string[] = API_SCOPES;
  if (!Array.isArray(scopes) || scopes.length === 0 || !scopes.every((s) => s === "*" || validScopes.includes(s))) {
    return NextResponse.json({ error: "Pick at least one valid scope." }, { status: 400 });
  }

  const { token, hash, prefix } = generateToken();
  const result = await pool.query(
    `INSERT INTO api_tokens (label, scopes, token_hash, key_prefix, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [label, scopes, hash, prefix, email]
  );

  // The plaintext token is only ever available in this one response --
  // it's not stored anywhere, only its hash is.
  return NextResponse.json({ id: result.rows[0].id, token });
}
