import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { configureGoogleBusinessNotifications } from "@/lib/googleBusiness";
import { setGoogleReviewUrl } from "@/lib/googleReview";

export async function PATCH(req: NextRequest) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const locationId = Number(body.locationId);
  const businessTitle = String(body.businessTitle || "").trim().slice(0, 200);
  const reviewUrl = String(body.reviewUrl || "").trim();
  if (!Number.isInteger(locationId) || locationId < 0) return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  if (locationId === 0 && !businessTitle) return NextResponse.json({ error: "Enter your business name." }, { status: 400 });
  if (locationId === 0 && !reviewUrl) return NextResponse.json({ error: "Paste the official Google review link." }, { status: 400 });
  if (reviewUrl) {
    try {
      const parsed = new URL(reviewUrl);
      const googleHost = /(^|\.)google\.(com|co\.[a-z]{2}|[a-z]{2})$/i.test(parsed.hostname) || parsed.hostname === "g.page";
      if (parsed.protocol !== "https:" || !googleHost) throw new Error();
    } catch { return NextResponse.json({ error: "Paste the official HTTPS Google review link." }, { status: 400 }); }
  }
  const selected = await withTransaction(async (client) => {
    let exists = locationId > 0
      ? await client.query(`SELECT l.id,l.connection_id,l.account_name FROM google_business_locations l JOIN google_business_connections c ON c.id=l.connection_id WHERE l.id=$1 AND c.disconnected_at IS NULL`, [locationId])
      : { rows: [], rowCount: 0 };
    if (!exists.rowCount) {
      if (locationId > 0) return false;
      const connection = await client.query("SELECT id FROM google_business_connections WHERE disconnected_at IS NULL ORDER BY id DESC LIMIT 1");
      if (!connection.rowCount) return false;
      exists = await client.query(
        `INSERT INTO google_business_locations(connection_id,account_name,location_name,title,selected,review_url,show_publicly)
         VALUES($1,'manual',$2,$3,false,$4,false)
         ON CONFLICT(connection_id,location_name) DO UPDATE SET title=EXCLUDED.title,review_url=EXCLUDED.review_url,updated_at=now()
         RETURNING id,connection_id,account_name`,
        [connection.rows[0].id, `manual/${connection.rows[0].id}`, businessTitle, reviewUrl]);
    }
    const resolvedLocationId = Number(exists.rows[0].id);
    await client.query("UPDATE google_business_locations SET selected=false,updated_at=now() WHERE selected=true");
    await client.query("UPDATE google_business_locations SET selected=true,review_url=$2,show_publicly=$3,title=CASE WHEN $4<>'' THEN $4 ELSE title END,updated_at=now() WHERE id=$1", [resolvedLocationId, reviewUrl || null, body.showPublicly === true, businessTitle]);
    const isManual = exists.rows[0].account_name === "manual";
    await client.query("UPDATE google_business_connections SET status=$2,last_error=CASE WHEN $2='connected' THEN NULL ELSE last_error END,updated_at=now() WHERE id=$1", [exists.rows[0].connection_id, isManual ? "configuring" : "connected"]);
    await client.query(`INSERT INTO google_business_audit_log(admin_email,action,resource_name,metadata) VALUES($1,'location_selected',$2,$3)`, [adminEmail, String(resolvedLocationId), JSON.stringify({ manual: isManual, showPublicly: body.showPublicly === true, reviewUrlConfigured: Boolean(reviewUrl) })]);
    return { accountName: String(exists.rows[0].account_name), locationId: resolvedLocationId, manual: isManual };
  });
  if (!selected) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  // Keep the link-based review requests (src/lib/reviewRequests.ts, and the
  // action on a contact) in sync automatically -- they read the official
  // review link from site_settings, independent of whether OAuth/API access
  // is connected, so it keeps working even if the connection later expires.
  if (reviewUrl) await setGoogleReviewUrl(reviewUrl).catch((error) => console.error("Failed to mirror Google review link into site_settings:", error));
  let notificationsConfigured = false;
  if (!selected.manual) try { notificationsConfigured = (await configureGoogleBusinessNotifications(selected.accountName)).configured; } catch (error) { console.error("Google review notifications could not be configured:", error); }
  return NextResponse.json({ ok: true, locationId: selected.locationId, notificationsConfigured });
}
