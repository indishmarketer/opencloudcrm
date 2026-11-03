import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { syncGoogleReviews } from "@/lib/googleBusiness";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

async function authenticated(req: NextRequest) {
  const expectedAudience = process.env.GOOGLE_BUSINESS_PUBSUB_AUDIENCE;
  const expectedEmail = process.env.GOOGLE_BUSINESS_PUBSUB_SERVICE_ACCOUNT;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expectedAudience || !expectedEmail || !token) return false;
  try {
    const { payload } = await jwtVerify(token, googleKeys, { audience: expectedAudience, issuer: ["https://accounts.google.com", "accounts.google.com"] });
    return payload.email === expectedEmail && payload.email_verified === true;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  if (!(await authenticated(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const envelope = await req.json().catch(() => null) as null | { message?: { messageId?: string; data?: string } };
  const messageId = envelope?.message?.messageId;
  if (!messageId) return NextResponse.json({ error: "Invalid Pub/Sub envelope" }, { status: 400 });
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(Buffer.from(envelope?.message?.data || "", "base64").toString("utf8")); } catch (err) {
    console.warn("Google Business Pub/Sub payload could not be decoded:", err instanceof Error ? err.message : err);
  }
  const key = crypto.createHash("sha256").update(messageId).digest("hex");
  const inserted = await pool.query(
    `INSERT INTO google_business_sync_events(event_key,event_type,resource_name) VALUES($1,$2,$3)
     ON CONFLICT(event_key) DO NOTHING RETURNING event_key`,
    [key, String(payload.notificationType || "UNKNOWN"), String(payload.reviewName || payload.locationName || "") || null]);
  if (!inserted.rowCount) return NextResponse.json({ ok: true, duplicate: true });
  try {
    await pool.query("UPDATE google_business_sync_events SET status='processing',attempts=attempts+1 WHERE event_key=$1", [key]);
    await syncGoogleReviews();
    await pool.query("UPDATE google_business_sync_events SET status='completed',completed_at=now() WHERE event_key=$1", [key]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await pool.query("UPDATE google_business_sync_events SET status='failed',last_error=$2,next_attempt_at=now()+interval '15 minutes' WHERE event_key=$1", [key, error instanceof Error ? error.message.slice(0, 500) : "Sync failed"]);
    // Return success so Pub/Sub does not create a hot retry loop; the regular
    // reconciliation job heals temporary failures.
    return NextResponse.json({ ok: true, queuedForReconciliation: true });
  }
}
