import { google } from "googleapis";
import { pool } from "@/lib/db";
import { SITE_URL } from "@/lib/liveSiteUrl";

export async function purgeCloudflareCache(): Promise<{ ok: boolean; message: string }> {
  const token = process.env.CLOUDFLARE_ZONE_TOKEN;
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zone) {
    return { ok: false, message: "Cloudflare zone token/ID not configured." };
  }
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ purge_everything: true }),
  });
  const body = await res.json();
  return {
    ok: !!body.success,
    message: body.success ? "Cache purged." : JSON.stringify(body.errors),
  };
}

function getGoogleAuth(scopes: string[]) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({ credentials, scopes });
}

// Never resubmits a URL that was already submitted within the last 14 days,
// and caps how many go out in one run. This keeps us well inside Google's
// own usage expectations instead of blasting the whole site every deploy.
const RESUBMIT_COOLDOWN_DAYS = 14;
const MAX_PER_RUN = 20;

async function filterToNewOrStale(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT url FROM indexed_urls WHERE url = ANY($1) AND submitted_at > now() - interval '${RESUBMIT_COOLDOWN_DAYS} days'`,
    [urls]
  );
  const recentlySubmitted = new Set(rows.map((r) => r.url));
  return urls.filter((u) => !recentlySubmitted.has(u)).slice(0, MAX_PER_RUN);
}

async function markSubmitted(urls: string[]) {
  if (urls.length === 0) return;
  await pool.query(
    `INSERT INTO indexed_urls (url, submitted_at)
     SELECT unnest($1::text[]), now()
     ON CONFLICT (url) DO UPDATE SET submitted_at = now()`,
    [urls]
  );
}

export async function submitUrlsForIndexing(candidateUrls: string[]): Promise<{
  candidates: number;
  submitted: number;
  skippedRecent: number;
  google: { url: string; ok: boolean }[];
  bing: { ok: boolean; message: string };
}> {
  const urls = await filterToNewOrStale(candidateUrls);
  const skippedRecent = candidateUrls.length - urls.length;

  const googleResults: { url: string; ok: boolean }[] = [];
  const auth = getGoogleAuth(["https://www.googleapis.com/auth/indexing"]);
  if (auth && urls.length > 0) {
    const client = await auth.getClient();
    const indexing = google.indexing({ version: "v3", auth: client as never });
    for (const url of urls) {
      try {
        await indexing.urlNotifications.publish({ requestBody: { url, type: "URL_UPDATED" } });
        googleResults.push({ url, ok: true });
      } catch {
        googleResults.push({ url, ok: false });
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  let bing = { ok: false, message: "Bing API key not configured, or nothing new to submit." };
  const bingKey = process.env.BING_API_KEY;
  if (bingKey && urls.length > 0) {
    try {
      const res = await fetch(
        `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=${bingKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ siteUrl: SITE_URL, urlList: urls }),
        }
      );
      bing = { ok: res.ok, message: `HTTP ${res.status}` };
    } catch (e) {
      bing = { ok: false, message: e instanceof Error ? e.message : "Failed" };
    }
  }

  await markSubmitted(urls);

  return { candidates: candidateUrls.length, submitted: urls.length, skippedRecent, google: googleResults, bing };
}
