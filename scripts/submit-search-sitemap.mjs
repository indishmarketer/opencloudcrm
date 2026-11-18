import { google } from "googleapis";

const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.indishmarketer.com";
const siteUrl = new URL(configuredUrl).origin;
const sitemapUrl = `${siteUrl}/sitemap.xml`;
const retiredUrls = ["/new-newsletter", "/community", "/webinars"].map((path) => `${siteUrl}${path}`);

async function submitGoogle() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { provider: "google", ok: false, message: "GOOGLE_SERVICE_ACCOUNT_JSON is not configured" };
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/webmasters"] });
  const client = await auth.getClient();
  const webmasters = google.webmasters({ version: "v3", auth: client });
  const sites = (await webmasters.sites.list()).data.siteEntry || [];
  const hostname = new URL(siteUrl).hostname.replace(/^www\./, "");
  const property = sites.find((entry) => entry.siteUrl === `sc-domain:${hostname}`)
    || sites.find((entry) => {
      try { return new URL(entry.siteUrl || "").hostname.replace(/^www\./, "") === hostname; } catch { return false; }
    });
  if (!property?.siteUrl) return { provider: "google", ok: false, message: `No verified Search Console property found for ${hostname}` };
  await webmasters.sitemaps.submit({ siteUrl: property.siteUrl, feedpath: sitemapUrl });
  return { provider: "google", ok: true, property: property.siteUrl, sitemap: sitemapUrl };
}

async function bingRequest(method, body) {
  const key = process.env.BING_API_KEY;
  if (!key) throw new Error("BING_API_KEY is not configured");
  const response = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/${method}?apikey=${encodeURIComponent(key)}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`);
  return response.json();
}

async function submitBing() {
  const sitesResponse = await bingRequest("GetUserSites");
  const hostname = new URL(siteUrl).hostname.replace(/^www\./, "");
  const matchingSite = (sitesResponse?.d || []).find((entry) => {
    try { return new URL(entry.Url || entry.url || "").hostname.replace(/^www\./, "") === hostname; } catch { return false; }
  });
  const bingSiteUrl = matchingSite?.Url || matchingSite?.url || siteUrl;
  await bingRequest("SubmitFeed", { siteUrl: bingSiteUrl, feedUrl: sitemapUrl });
  await bingRequest("SubmitUrlBatch", { siteUrl: bingSiteUrl, urlList: retiredUrls });
  return { provider: "bing", ok: true, property: bingSiteUrl, sitemap: sitemapUrl, retiredUrlsSubmitted: retiredUrls.length };
}

const results = await Promise.allSettled([submitGoogle(), submitBing()]);
const summary = results.map((result, index) => result.status === "fulfilled"
  ? result.value
  : { provider: index === 0 ? "google" : "bing", ok: false, message: result.reason instanceof Error ? result.reason.message : "Submission failed" });
console.log(JSON.stringify(summary));
if (summary.some((result) => !result.ok)) process.exitCode = 1;
