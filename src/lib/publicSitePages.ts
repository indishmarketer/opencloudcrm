import { SITE_NAME } from "@/config/brand";

export type SearchResult = {
  type: string;
  title: string;
  desc: string | null;
  url: string;
};

export type PublicSitePage = SearchResult & {
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
  /** Kept out of the sitemap (e.g. the page already sets `noindex` in its
   * own metadata) while still showing up in the site's own search bar,
   * which is unrelated to external SEO indexing. */
  noindex?: boolean;
};

/**
 * The public, indexable app routes that do not come from the database. This
 * is shared by the sitemap and site search so a newly added public route is
 * discoverable in both places from one catalogue entry. Page-builder pages
 * (the homepage, /about, any custom page) are added from the database by
 * listPublishedPageEntries() instead.
 */
export const PUBLIC_SITE_PAGES: PublicSitePage[] = [
  { type: "page", title: "AI Voice Agent", desc: "An AI voice agent product for handling business calls.", url: "/products/voice-agent", changeFrequency: "monthly", priority: 0.8 },
  { type: "page", title: "Courses", desc: "Practical courses for marketers and business owners.", url: "/courses", changeFrequency: "monthly", priority: 0.8 },
  { type: "page", title: "Reviews", desc: `Client stories and reviews of ${SITE_NAME}.`, url: "/reviews", changeFrequency: "monthly", priority: 0.7 },
  { type: "page", title: "Blog", desc: "Guides, reviews, and practical marketing insights.", url: "/blog", changeFrequency: "daily", priority: 0.9 },
  { type: "page", title: "Blog categories", desc: "Browse blog posts by topic.", url: "/blog/category", changeFrequency: "weekly", priority: 0.5 },
  { type: "page", title: "Newsletter", desc: "The exact automations and AI agents we build for paying clients, broken down step by step.", url: "/newsletter", changeFrequency: "monthly", priority: 0.7 },
  { type: "page", title: "Write for us", desc: "Apply to contribute a guest post.", url: "/apply-to-write", changeFrequency: "yearly", priority: 0.3 },
  { type: "page", title: "Terms and Conditions", desc: `The terms that govern use of ${SITE_NAME}.`, url: "/terms", changeFrequency: "yearly", priority: 0.2 },
  { type: "page", title: "Privacy Policy", desc: `How ${SITE_NAME} collects, uses, and protects information.`, url: "/privacy-policy", changeFrequency: "yearly", priority: 0.2 },
  { type: "page", title: "Cancellation & Refund Policy", desc: "How cancellations and refunds work for courses and digital products.", url: "/refund-policy", changeFrequency: "yearly", priority: 0.2 },
  { type: "community", title: "Community", desc: "Join public discussions with indie marketers.", url: "/community/general", changeFrequency: "daily", priority: 0.6 },
  { type: "community", title: "Community leaderboard", desc: "See active community members and contributions.", url: "/community/leaderboard", changeFrequency: "daily", priority: 0.6 },
  { type: "community", title: "Community members", desc: "Browse public community member profiles.", url: "/community/members", changeFrequency: "daily", priority: 0.5 },
  { type: "tool", title: "Tools directory", desc: "Browse and compare tools for indie marketers.", url: "/tools", changeFrequency: "daily", priority: 0.8 },
  { type: "webinar", title: "Webinars", desc: "Watch scheduled and on-demand webinars.", url: "/webinars", changeFrequency: "weekly", priority: 0.7 },
  // Only the landing page belongs here -- individual prompts/skills/guides
  // are dynamic DB content, registered directly in sitemap.ts (like blog
  // posts) rather than duplicated into this static list.
  { type: "page", title: "Free Prompt & Skill Library", desc: "A free, public library of ready-to-use AI prompts and downloadable agent skills for images, video, agents, coding, and marketing.", url: "/resources/prompt-skill-library", changeFrequency: "weekly", priority: 0.6 },
  { type: "page", title: "Submit Your Tool", desc: "Submit a tool to the directory.", url: "/tools/submit", changeFrequency: "monthly", priority: 0.3 },
];

function tokensFor(query: string) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function singular(value: string) {
  return value.endsWith("s") ? value.slice(0, -1) : value;
}

function scoreResult(result: SearchResult, query: string) {
  const normalized = query.trim().toLowerCase();
  const title = result.title.toLowerCase();
  const description = (result.desc || "").toLowerCase();
  const url = result.url.toLowerCase();
  const searchable = `${title} ${description} ${url}`;
  const tokens = tokensFor(query);

  if (!tokens.length || !tokens.every((token) => searchable.includes(token))) return -1;
  if (title === normalized || singular(title) === singular(normalized)) return 1000;
  if (title.startsWith(normalized)) return 850;
  if (title.includes(normalized)) return 700;
  if (description.includes(normalized)) return 500;
  return tokens.reduce((score, token) => score + (title.includes(token) ? 90 : description.includes(token) ? 45 : 15), 0);
}

/** Ranks and de-duplicates every public search source without modifying text. */
export function rankSearchResults(results: SearchResult[], query: string, limit = 24): SearchResult[] {
  const seen = new Set<string>();
  return results
    .map((result) => ({ result, score: scoreResult(result, query) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title))
    .filter(({ result }) => {
      if (seen.has(result.url)) return false;
      seen.add(result.url);
      return true;
    })
    .slice(0, limit)
    .map(({ result }) => result);
}

export function searchPublicSitePages(query: string) {
  return rankSearchResults(PUBLIC_SITE_PAGES, query);
}
