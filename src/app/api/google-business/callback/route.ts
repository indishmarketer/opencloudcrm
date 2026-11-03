import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";
import { discoverGoogleBusinessLocations, exchangeGoogleBusinessCode, GOOGLE_BUSINESS_SCOPE } from "@/lib/googleBusiness";
import { encryptCredential } from "@/lib/secureCredential";
import { SITE_URL } from "@/config/brand";

export async function GET(req: NextRequest) {
  const adminEmail = await getAdminSessionEmail();
  const state = req.nextUrl.searchParams.get("state") || "";
  const code = req.nextUrl.searchParams.get("code") || "";
  if (!adminEmail || !state || !code) return NextResponse.redirect(`${SITE_URL}/console/reviews?google=oauth-error`);
  const hash = crypto.createHash("sha256").update(state).digest("hex");
  const consumed = await pool.query(
    `UPDATE google_business_oauth_states SET used_at=now() WHERE state_hash=$1 AND admin_email=$2 AND used_at IS NULL AND expires_at>now() RETURNING state_hash`,
    [hash, adminEmail]);
  if (!consumed.rowCount) return NextResponse.redirect(`${SITE_URL}/console/reviews?google=invalid-state`);
  try {
    const tokens = await exchangeGoogleBusinessCode(code);
    if (!tokens.refresh_token) throw new Error("Google did not return an offline refresh token; revoke the app grant and reconnect");
    if (!(tokens.scope || "").split(" ").includes(GOOGLE_BUSINESS_SCOPE)) throw new Error("Required Business Profile scope was not granted");
    let locations: Awaited<ReturnType<typeof discoverGoogleBusinessLocations>> = [];
    let discoveryError: string | null = null;
    try {
      locations = await discoverGoogleBusinessLocations(tokens.access_token);
      if (locations.length === 0) discoveryError = "Google OAuth succeeded, but no accessible Business Profile locations were returned.";
    } catch (error) {
      discoveryError = error instanceof Error ? error.message.slice(0, 500) : "Business Profile location discovery is not available yet.";
      console.warn("Google OAuth succeeded but Business Profile discovery is pending:", discoveryError);
    }
    await withTransaction(async (client) => {
      await client.query("UPDATE google_business_locations SET selected=false,show_publicly=false,updated_at=now() WHERE selected=true OR show_publicly=true");
      await client.query("UPDATE google_business_connections SET disconnected_at=now(),status='disconnected',updated_at=now() WHERE disconnected_at IS NULL");
      const connection = await client.query(
        `INSERT INTO google_business_connections(connected_by_email,refresh_token_encrypted,access_token_encrypted,access_token_expires_at,granted_scope,status,last_checked_at,last_error)
         VALUES($1,$2,$3,now()+($4*interval '1 second'),$5,'configuring',now(),$6) RETURNING id`,
        [adminEmail, encryptCredential(tokens.refresh_token!), encryptCredential(tokens.access_token), tokens.expires_in, tokens.scope, discoveryError]);
      for (const location of locations) await client.query(
        `INSERT INTO google_business_locations(connection_id,account_name,location_name,title,address_text,place_id)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [connection.rows[0].id, location.accountName, location.locationName, location.title, location.address, location.placeId]);
      await client.query(`INSERT INTO google_business_audit_log(admin_email,action,metadata) VALUES($1,'oauth_connected',$2)`, [adminEmail, JSON.stringify({ locationCount: locations.length, discoveryPending: Boolean(discoveryError) })]);
    });
    return NextResponse.redirect(`${SITE_URL}/console/reviews?google=${discoveryError ? "access-pending" : "connected"}`);
  } catch (error) {
    console.error("Google Business OAuth callback failed:", error);
    return NextResponse.redirect(`${SITE_URL}/console/reviews?google=api-error`);
  }
}
