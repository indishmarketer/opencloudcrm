// Knowledge base is pulled live from the real site's own pages instead of
// hand-maintained markdown -- owner's request (2026-08-21): the agent
// should know what's actually on indishmarketer.com, not a separately
// maintained copy that can drift out of sync. Fetched and cached with a
// TTL so every call doesn't re-hit the site; refreshed in the background.

const WEBSITE_URL = process.env.WEBSITE_URL || "https://indishmarketer.com";
const PAGES = ["/", "/about", "/services", "/courses", "/products"];
const PER_PAGE_CHAR_LIMIT = 3000;
const REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours

let cached = "";
let lastFetchedAt = 0;
let inFlight = null;

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPage(path) {
  try {
    const res = await fetch(`${WEBSITE_URL}${path}`, {
      headers: { "User-Agent": "voice-agent-knowledge-refresh" },
      // fetch() has no default timeout -- without this, a stalled
      // connection to the site (network blip, deploy in progress) can hang
      // this call forever, which on the FIRST-ever refresh (no cached copy
      // to fall back to) blocks buildSystemPrompt() and therefore the
      // entire turn indefinitely -- the client would sit on "speaking"
      // with nothing ever arriving, no different from the runTurn bug
      // fixed the same day in call.js.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return htmlToText(html).slice(0, PER_PAGE_CHAR_LIMIT);
  } catch {
    return "";
  }
}

async function refresh() {
  const sections = await Promise.all(
    PAGES.map(async (path) => {
      const text = await fetchPage(path);
      return text ? `## Page: ${WEBSITE_URL}${path}\n${text}` : "";
    })
  );
  const combined = sections.filter(Boolean).join("\n\n");
  if (combined) {
    cached = combined;
    lastFetchedAt = Date.now();
  }
  return cached;
}

export async function getKnowledgeBase() {
  const stale = Date.now() - lastFetchedAt > REFRESH_MS;
  if (!cached || stale) {
    // Don't block a live call on a slow refresh if we already have
    // something cached -- kick it off in the background and serve the
    // stale copy for this turn.
    if (!cached) {
      cached = await refresh();
    } else if (!inFlight) {
      inFlight = refresh().finally(() => (inFlight = null));
    }
  }
  return cached;
}
