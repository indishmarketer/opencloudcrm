import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";
import { googleBusinessAuthorizationUrl, googleBusinessConfigured } from "@/lib/googleBusiness";
import { SITE_URL } from "@/lib/liveSiteUrl";

export async function GET() {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!googleBusinessConfigured()) return NextResponse.redirect(new URL("/console/reviews?google=missing-config", SITE_URL));
  const state = crypto.randomBytes(32).toString("base64url");
  const stateHash = crypto.createHash("sha256").update(state).digest("hex");
  await pool.query("DELETE FROM google_business_oauth_states WHERE expires_at<now() OR used_at IS NOT NULL");
  await pool.query("INSERT INTO google_business_oauth_states(state_hash,admin_email,expires_at) VALUES($1,$2,now()+interval '10 minutes')", [stateHash, adminEmail]);
  return NextResponse.redirect(googleBusinessAuthorizationUrl(state));
}
