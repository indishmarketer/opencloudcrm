import { google } from "googleapis";
import { pool } from "@/lib/db";
import { SITE_URL, SITE_HOSTNAME } from "@/config/brand";

function getGoogleAuth(scopes: string[]) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({ credentials, scopes });
}

const GA4_PROPERTY = "properties/493136579";
const GSC_SITE = `sc-domain:${SITE_HOSTNAME}`;

// Every external analytics/SEO source here (GA4, Search Console, Bing,
// Clarity) is fetched live ONLY when the owner clicks "Refresh" in
// /console/analytics -- never on a schedule, never on an ordinary page
// view. These platforms have real rate/quota limits (Clarity's is a
// strict per-day quota), and a background cron or an auto-fetch on every
// console visit burns through them without the owner asking for it. The
// *Live() functions below do the actual network call; everything else
// (Overview, the analytics page's default view) reads the last result
// back from analytics_cache, which only a manual refresh writes to.

async function fetchGA4Live() {
  const auth = getGoogleAuth(["https://www.googleapis.com/auth/analytics.readonly"]);
  if (!auth) return { error: "Google service account not configured." };
  try {
    const client = await auth.getClient();
    const analyticsData = google.analyticsdata({ version: "v1beta", auth: client as never });

    const [summary, topPages, topLandingPages] = await Promise.all([
      analyticsData.properties.runReport({
        property: GA4_PROPERTY,
        requestBody: {
          dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
          metrics: [
            { name: "sessions" },
            { name: "activeUsers" },
            { name: "averageSessionDuration" },
            { name: "screenPageViews" },
            { name: "keyEvents" },
          ],
        },
      }),
      analyticsData.properties.runReport({
        property: GA4_PROPERTY,
        requestBody: {
          dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: "10",
        },
      }),
      analyticsData.properties.runReport({
        property: GA4_PROPERTY,
        requestBody: {
          dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
          dimensions: [{ name: "landingPagePlusQueryString" }],
          metrics: [{ name: "sessions" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: "10",
        },
      }),
    ]);

    const row = summary.data.rows?.[0]?.metricValues;
    return {
      sessions: row?.[0]?.value || "0",
      activeUsers: row?.[1]?.value || "0",
      avgSessionSeconds: row?.[2]?.value || "0",
      pageViews: row?.[3]?.value || "0",
      keyEvents: row?.[4]?.value || "0",
      topPages: (topPages.data.rows || []).map((r) => ({
        path: r.dimensionValues?.[0]?.value || "",
        views: r.metricValues?.[0]?.value || "0",
      })),
      topLandingPages: (topLandingPages.data.rows || []).map((r) => ({
        path: r.dimensionValues?.[0]?.value || "",
        sessions: r.metricValues?.[0]?.value || "0",
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "GA4 fetch failed." };
  }
}

async function fetchSearchConsoleLive() {
  const auth = getGoogleAuth(["https://www.googleapis.com/auth/webmasters.readonly"]);
  if (!auth) return { error: "Google service account not configured." };
  try {
    const client = await auth.getClient();
    const webmasters = google.webmasters({ version: "v3", auth: client as never });

    const [totals, topQueries, topPages] = await Promise.all([
      webmasters.searchanalytics.query({
        siteUrl: GSC_SITE,
        requestBody: { startDate: daysAgo(28), endDate: daysAgo(1) },
      }),
      webmasters.searchanalytics.query({
        siteUrl: GSC_SITE,
        requestBody: {
          startDate: daysAgo(28),
          endDate: daysAgo(1),
          dimensions: ["query"],
          rowLimit: 10,
        },
      }),
      webmasters.searchanalytics.query({
        siteUrl: GSC_SITE,
        requestBody: {
          startDate: daysAgo(28),
          endDate: daysAgo(1),
          dimensions: ["page"],
          rowLimit: 10,
        },
      }),
    ]);

    const t = totals.data.rows?.[0];
    return {
      clicks: t?.clicks ?? 0,
      impressions: t?.impressions ?? 0,
      ctr: t?.ctr ?? 0,
      position: t?.position ?? 0,
      topQueries: (topQueries.data.rows || []).map((r) => ({
        query: r.keys?.[0] || "",
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
      })),
      topPages: (topPages.data.rows || []).map((r) => ({
        page: r.keys?.[0] || "",
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Search Console fetch failed." };
  }
}

async function fetchBingLive() {
  const apiKey = process.env.BING_API_KEY;
  const siteUrl = SITE_URL;
  if (!apiKey) return { error: "Bing API key not configured." };
  try {
    const [trafficRes, queryRes, pageRes] = await Promise.all([
      fetch(
        `https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?apikey=${apiKey}&siteUrl=${encodeURIComponent(siteUrl)}`
      ),
      fetch(
        `https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?apikey=${apiKey}&siteUrl=${encodeURIComponent(siteUrl)}`
      ),
      fetch(
        `https://ssl.bing.com/webmaster/api.svc/json/GetPageStats?apikey=${apiKey}&siteUrl=${encodeURIComponent(siteUrl)}`
      ),
    ]);
    if (!trafficRes.ok) return { error: `Bing API returned ${trafficRes.status}` };

    const traffic = await trafficRes.json();
    const trafficRows: { Clicks: number; Impressions: number }[] = traffic.d || [];
    const last28 = trafficRows.slice(-28);
    const totalClicks = last28.reduce((sum, r) => sum + (r.Clicks || 0), 0);
    const totalImpressions = last28.reduce((sum, r) => sum + (r.Impressions || 0), 0);

    const aggregate = (
      rows: { Query: string; Clicks: number; Impressions: number }[],
      keyLabel: "query" | "page"
    ) => {
      const byKey = new Map<string, { clicks: number; impressions: number }>();
      for (const r of rows) {
        const existing = byKey.get(r.Query) || { clicks: 0, impressions: 0 };
        existing.clicks += r.Clicks || 0;
        existing.impressions += r.Impressions || 0;
        byKey.set(r.Query, existing);
      }
      return Array.from(byKey.entries())
        .map(([key, v]) => ({ [keyLabel]: key, ...v }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10);
    };

    const queryData = queryRes.ok ? await queryRes.json() : { d: [] };
    const pageData = pageRes.ok ? await pageRes.json() : { d: [] };

    return {
      clicks: totalClicks,
      impressions: totalImpressions,
      topQueries: aggregate(queryData.d || [], "query"),
      topPages: aggregate(pageData.d || [], "page"),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Bing fetch failed." };
  }
}

type CacheEntry<T> = T & { fetchedAt?: string };

async function getCached<T>(key: string): Promise<CacheEntry<T> | { error: string }> {
  const result = await pool.query("SELECT data, fetched_at FROM analytics_cache WHERE key = $1", [key]);
  if (result.rows.length === 0) {
    return { error: "Not refreshed yet. Click Refresh to pull data." };
  }
  return { ...(result.rows[0].data as T), fetchedAt: result.rows[0].fetched_at as string };
}

async function setCached(key: string, data: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO analytics_cache (key, data, fetched_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET data = $2, fetched_at = now()`,
    [key, JSON.stringify(data)]
  );
}

/** Called only by the manual "Refresh" button in /console/analytics.
 * Fetches all four sources live and persists each successful result to
 * analytics_cache. A source that errors is returned as-is for display,
 * but its cache entry is left untouched -- so the next ordinary page
 * view still shows the last good dump instead of an error. */
export async function refreshAllAnalytics() {
  const [ga4, searchConsole, bing] = await Promise.all([
    fetchGA4Live(),
    fetchSearchConsoleLive(),
    fetchBingLive(),
  ]);

  await Promise.all([
    "error" in ga4 ? null : setCached("ga4", ga4),
    "error" in searchConsole ? null : setCached("search_console", searchConsole),
    "error" in bing ? null : setCached("bing", bing),
  ]);

  const now = new Date().toISOString();
  return {
    ga4: "error" in ga4 ? ga4 : { ...ga4, fetchedAt: now },
    searchConsole: "error" in searchConsole ? searchConsole : { ...searchConsole, fetchedAt: now },
    bing: "error" in bing ? bing : { ...bing, fetchedAt: now },
    fetchedAt: now,
  };
}

type Ga4Data = Exclude<Awaited<ReturnType<typeof fetchGA4Live>>, { error: string }>;
type SearchConsoleData = Exclude<Awaited<ReturnType<typeof fetchSearchConsoleLive>>, { error: string }>;
type BingData = Exclude<Awaited<ReturnType<typeof fetchBingLive>>, { error: string }>;

/** Reads the last refreshed dump for all three sources -- never calls any
 * external API. Used by Overview and the analytics page's default view. */
export async function getCachedAnalytics() {
  const [ga4, searchConsole, bing] = await Promise.all([
    getCached<Ga4Data>("ga4"),
    getCached<SearchConsoleData>("search_console"),
    getCached<BingData>("bing"),
  ]);
  return { ga4, searchConsole, bing };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
