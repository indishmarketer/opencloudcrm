import { pool } from "@/lib/db";
import { decryptCredential, encryptCredential } from "@/lib/secureCredential";
import { SITE_URL } from "@/lib/liveSiteUrl";

const SCOPE = "https://www.googleapis.com/auth/business.manage";

export function googleBusinessConfigured() {
  return Boolean(process.env.GOOGLE_BUSINESS_CLIENT_ID && process.env.GOOGLE_BUSINESS_CLIENT_SECRET);
}

export function googleBusinessRedirectUri() {
  return process.env.GOOGLE_BUSINESS_REDIRECT_URI || `${SITE_URL}/api/google-business/callback`;
}

export function googleBusinessAuthorizationUrl(state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_BUSINESS_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", googleBusinessRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Google token exchange failed");
  return data as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
}

export async function exchangeGoogleBusinessCode(code: string) {
  return tokenRequest(new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET || "",
    redirect_uri: googleBusinessRedirectUri(),
    grant_type: "authorization_code",
  }));
}

export async function getGoogleBusinessAccessToken(connectionId?: number) {
  const result = await pool.query(
    `SELECT id, refresh_token_encrypted, access_token_encrypted, access_token_expires_at
     FROM google_business_connections
     WHERE disconnected_at IS NULL AND ($1::bigint IS NULL OR id = $1)
     ORDER BY id DESC LIMIT 1`, [connectionId ?? null]);
  const row = result.rows[0];
  if (!row) throw new Error("Google Business Profile is not connected");
  if (row.access_token_encrypted && row.access_token_expires_at && new Date(row.access_token_expires_at).getTime() > Date.now() + 60_000) {
    return { connectionId: Number(row.id), accessToken: decryptCredential(row.access_token_encrypted) };
  }
  const tokens = await tokenRequest(new URLSearchParams({
    refresh_token: decryptCredential(row.refresh_token_encrypted),
    client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET || "",
    grant_type: "refresh_token",
  }));
  await pool.query(
    `UPDATE google_business_connections SET access_token_encrypted = $2,
       access_token_expires_at = now() + ($3 * interval '1 second'), status = 'connected',
       last_checked_at = now(), last_error = NULL, updated_at = now() WHERE id = $1`,
    [row.id, encryptCredential(tokens.access_token), tokens.expires_in]);
  return { connectionId: Number(row.id), accessToken: tokens.access_token };
}

async function googleJson(url: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Google Business API returned ${response.status}`);
  return body;
}

export async function discoverGoogleBusinessLocations(accessToken: string) {
  const accounts = await googleJson("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", accessToken);
  const locations: Array<{ accountName: string; locationName: string; title: string; address: string | null; placeId: string | null }> = [];
  for (const account of accounts.accounts || []) {
    let pageToken = "";
    do {
      const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`);
      url.searchParams.set("readMask", "name,title,storefrontAddress,metadata.placeId");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const data = await googleJson(url.toString(), accessToken);
      for (const location of data.locations || []) locations.push({
        accountName: account.name,
        locationName: location.name,
        title: location.title || location.name,
        address: location.storefrontAddress ? Object.values(location.storefrontAddress).filter(Boolean).join(", ") : null,
        placeId: location.metadata?.placeId || null,
      });
      pageToken = data.nextPageToken || "";
    } while (pageToken);
  }
  return locations;
}

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export async function syncGoogleReviews(locationId?: number) {
  const selected = await pool.query(
    `SELECT l.*, c.id AS connection_id FROM google_business_locations l
     JOIN google_business_connections c ON c.id = l.connection_id
     WHERE l.selected = true AND c.disconnected_at IS NULL AND ($1::bigint IS NULL OR l.id = $1)
     LIMIT 1`, [locationId ?? null]);
  const location = selected.rows[0];
  if (!location) throw new Error("Select a Google Business Profile location first");
  const { accessToken } = await getGoogleBusinessAccessToken(Number(location.connection_id));
  const accountId = String(location.account_name).split("/").pop();
  const locationName = String(location.location_name);
  const locationIdValue = locationName.split("/").pop();
  let pageToken = "";
  const seen: string[] = [];
  let averageRating: number | null = null;
  let totalReviewCount: number | null = null;
  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationIdValue}/reviews`);
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await googleJson(url.toString(), accessToken);
    averageRating = data.averageRating ?? averageRating;
    totalReviewCount = data.totalReviewCount ?? totalReviewCount;
    for (const review of data.reviews || []) {
      const resourceName = review.name || `accounts/${accountId}/locations/${locationIdValue}/reviews/${review.reviewId}`;
      seen.push(resourceName);
      await pool.query(
        `INSERT INTO google_reviews (resource_name, location_id, review_id, reviewer_name, reviewer_photo_url,
          is_anonymous, star_rating, comment, create_time, update_time, reply_comment, reply_update_time, fetched_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now()+interval '30 days')
         ON CONFLICT (resource_name) DO UPDATE SET reviewer_name=EXCLUDED.reviewer_name,
          reviewer_photo_url=EXCLUDED.reviewer_photo_url, is_anonymous=EXCLUDED.is_anonymous,
          star_rating=EXCLUDED.star_rating, comment=EXCLUDED.comment, create_time=EXCLUDED.create_time,
          update_time=EXCLUDED.update_time, reply_comment=EXCLUDED.reply_comment,
          reply_update_time=EXCLUDED.reply_update_time, fetched_at=now(), expires_at=now()+interval '30 days'`,
        [resourceName, location.id, review.reviewId || null, review.reviewer?.displayName || null,
         review.reviewer?.profilePhotoUrl || null, review.reviewer?.isAnonymous === true,
         STAR_MAP[review.starRating] || 1, review.comment || null, review.createTime || null,
         review.updateTime || null, review.reviewReply?.comment || null, review.reviewReply?.updateTime || null]);
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  await pool.query(
    `UPDATE google_business_locations SET average_rating=$2,total_review_count=$3,last_synced_at=now(),last_error=NULL,updated_at=now() WHERE id=$1`,
    [location.id, averageRating, totalReviewCount]);
  await pool.query("DELETE FROM google_reviews WHERE expires_at <= now()");
  return { count: seen.length, averageRating, totalReviewCount };
}

export async function publishGoogleReviewReply(resourceName: string, comment: string) {
  const review = await pool.query(`SELECT l.connection_id FROM google_reviews r JOIN google_business_locations l ON l.id=r.location_id WHERE r.resource_name=$1`, [resourceName]);
  if (!review.rowCount) throw new Error("Google review not found");
  const { accessToken } = await getGoogleBusinessAccessToken(Number(review.rows[0].connection_id));
  await googleJson(`https://mybusiness.googleapis.com/v4/${resourceName}/reply`, accessToken, { method: "PUT", body: JSON.stringify({ comment }) });
  await syncGoogleReviews();
}

export async function configureGoogleBusinessNotifications(accountName: string) {
  const topic = process.env.GOOGLE_BUSINESS_PUBSUB_TOPIC;
  if (!topic) return { configured: false, reason: "GOOGLE_BUSINESS_PUBSUB_TOPIC is missing" };
  const { accessToken } = await getGoogleBusinessAccessToken();
  const name = `${accountName}/notificationSetting`;
  await googleJson(`https://mybusinessnotifications.googleapis.com/v1/${name}?updateMask=pubsubTopic`, accessToken, { method: "PATCH", body: JSON.stringify({ name, pubsubTopic: topic }) });
  return { configured: true };
}

export async function reconcileGoogleReviewsIfDue() {
  const failedEvents = await pool.query(`SELECT event_key FROM google_business_sync_events WHERE status='failed' AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 20`);
  if (failedEvents.rowCount) {
    try {
      const result = await syncGoogleReviews();
      await pool.query(`UPDATE google_business_sync_events SET status='completed',completed_at=now(),last_error=NULL WHERE event_key=ANY($1::text[])`, [failedEvents.rows.map((row) => row.event_key)]);
      return { skipped: false, ...result, retriedEvents: failedEvents.rowCount };
    } catch (error) {
      await pool.query(`UPDATE google_business_sync_events SET attempts=attempts+1,next_attempt_at=now()+LEAST(interval '6 hours',interval '15 minutes'*(attempts+1)),last_error=$2 WHERE event_key=ANY($1::text[])`, [failedEvents.rows.map((row) => row.event_key), error instanceof Error ? error.message.slice(0, 500) : "Retry failed"]);
      return { skipped: false, error: true };
    }
  }
  const due = await pool.query(`SELECT id FROM google_business_locations WHERE selected=true AND (last_synced_at IS NULL OR last_synced_at<now()-interval '6 hours') LIMIT 1`);
  if (!due.rowCount) return { skipped: true };
  try { return { skipped: false, ...(await syncGoogleReviews(Number(due.rows[0].id))) }; }
  catch (error) {
    await pool.query(`UPDATE google_business_locations SET last_error=$2,updated_at=now() WHERE id=$1`, [due.rows[0].id, error instanceof Error ? error.message.slice(0, 500) : "Reconciliation failed"]);
    return { skipped: false, error: true };
  }
}

export { SCOPE as GOOGLE_BUSINESS_SCOPE };
