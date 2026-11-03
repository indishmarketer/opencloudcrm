import { NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";
import { decryptCredential } from "@/lib/secureCredential";

export async function POST() {
  const admin = await getAdminSessionEmail();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = await pool.query("SELECT refresh_token_encrypted FROM google_business_connections WHERE disconnected_at IS NULL ORDER BY id DESC LIMIT 1");
  if (current.rowCount) {
    try { await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decryptCredential(current.rows[0].refresh_token_encrypted) }) }); } catch (error) { console.error("Google token revocation failed; local disconnect continues:", error); }
  }
  await pool.query("UPDATE google_business_connections SET status='disconnected',disconnected_at=now(),updated_at=now() WHERE disconnected_at IS NULL");
  await pool.query(`INSERT INTO google_business_audit_log(admin_email,action) VALUES($1,'oauth_disconnected')`, [admin]);
  return NextResponse.json({ ok: true });
}
