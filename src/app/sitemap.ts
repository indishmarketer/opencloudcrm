import type { MetadataRoute } from "next";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { getCuratedReviewers } from "@/lib/curatedReviews";
import { listDiscoverableAuthors } from "@/lib/blogAuthors";
import { pool } from "@/lib/db";
import { PUBLIC_SITE_PAGES } from "@/lib/publicSitePages";
import { listPublishedPageEntries } from "@/lib/sitePages";
import { BUILT_IN_PATHS } from "@/lib/defaultPages";
import { SITE_URL as BASE_URL } from "@/lib/liveSiteUrl";
import { buildSafe } from "@/lib/db";
import { getCrawlSettings } from "@/lib/siteCrawlSettings";
import { getPublishedPage } from "@/lib/sitePages";

/** Built-in routes with their own page-builder row -- excluded from the
 * sitemap (the hub and everything under it) whenever the owner has taken
 * that page offline. */
const MANAGED_PAGE_PREFIXES = ["/courses", "/webinars", "/reviews", "/tools", "/newsletter"];

async function safePart<T>(name: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error(`Sitemap section ${name} failed:`, error);
    return fallback;
  }
}

async function safeRows<T extends Record<string, unknown>>(name: string, sql: string): Promise<T[]> {
  return safePart(name, async () => (await pool.query<T>(sql)).rows, []);
}

async function offlineManagedPrefixes(): Promise<string[]> {
  const checks = await Promise.all(MANAGED_PAGE_PREFIXES.map(async (p) => {
    // Fail closed if a managed page's publish state cannot be read.
    return (await safePart(`publish state ${p}`, () => getPublishedPage(p), null)) ? null : p;
  }));
  return checks.filter((p): p is string => p !== null);
}

export const revalidate = 300; // Retry incomplete sections within five minutes.

// See the build-phase note on buildSafe (src/lib/db.ts): a fresh
// self-host install's database may not be migrated yet when this runs
// during `next build`, and it's better to ship an empty sitemap that
// fills in on the next revalidation than to fail the whole production
// build over it.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSafe(buildSitemap, []);
}

async function buildSitemap(): Promise<MetadataRoute.Sitemap> {
  const offlinePrefixes = await offlineManagedPrefixes();
  const staticRoutes: MetadataRoute.Sitemap = PUBLIC_SITE_PAGES
    .filter((p) => !p.noindex)
    .map(({ url, changeFrequency, priority }) => ({
      url: `${BASE_URL}${url}`,
      changeFrequency,
      priority,
    }));

  // Built-in routes are already listed above; only add builder pages.
  const builderRoutes: MetadataRoute.Sitemap = (await safePart("builder pages", listPublishedPageEntries, []))
    .filter((p) => !BUILT_IN_PATHS.has(p.path))
    .map((p) => ({
      url: `${BASE_URL}${p.path === "/" ? "" : p.path}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: p.path === "/" ? "weekly" : "monthly",
      priority: p.path === "/" ? 1 : 0.6,
    }));

  const courses = await safeRows<{ slug: string }>("courses", "SELECT slug FROM courses WHERE published = true");
  const courseRoutes: MetadataRoute.Sitemap = courses.map((c) => ({
    url: `${BASE_URL}/courses/${c.slug}`,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // Drafts stay out until they are published from /console/blog.
  const postRoutes: MetadataRoute.Sitemap = (await safePart("blog posts", getPublicPosts, [])).map((p) => ({
    url: `${BASE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.published_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = (await safePart("blog categories", getBlogCategories, [])).map((c) => ({
    url: `${BASE_URL}/blog/category/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const reviewerRoutes: MetadataRoute.Sitemap = (await safePart("reviews", getCuratedReviewers, [])).map((r) => ({
    url: `${BASE_URL}/reviews/${r.slug}`,
    changeFrequency: "yearly",
    priority: 0.4,
  }));

  const authorRoutes: MetadataRoute.Sitemap = (await safePart("authors", listDiscoverableAuthors, [])).map((a) => ({
    url: `${BASE_URL}/author/${a.slug}`,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  const directoryCategories = await safeRows<{ slug: string }>("tool categories",
    "SELECT c.slug FROM directory_categories c WHERE EXISTS (SELECT 1 FROM directory_tools t WHERE t.category_id = c.id AND t.status = 'published')"
  );
  const toolCategoryRoutes: MetadataRoute.Sitemap = directoryCategories.map((c) => ({
    url: `${BASE_URL}/tools/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const tools = await safeRows<{ slug: string; category_slug: string; updated_at: string }>("tools",
    "SELECT t.slug, c.slug AS category_slug, t.updated_at FROM directory_tools t JOIN directory_categories c ON c.id = t.category_id WHERE t.status = 'published'"
  );
  const toolRoutes: MetadataRoute.Sitemap = tools.map((t) => ({
    url: `${BASE_URL}/tools/${t.category_slug}/${t.slug}`,
    lastModified: new Date(t.updated_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const forumPosts = await safeRows<{ id: number; created_at: string }>("forum posts",
    "SELECT id, created_at FROM forum_posts WHERE space = 'general' AND status = 'approved'"
  );
  const forumPostRoutes: MetadataRoute.Sitemap = forumPosts.map((p) => ({
    url: `${BASE_URL}/community/general/${p.id}`,
    lastModified: new Date(p.created_at),
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const members = await safeRows<{ username: string; created_at: string }>("members",
    "SELECT username, created_at FROM users WHERE username IS NOT NULL AND id NOT IN (SELECT user_id FROM community_bans)"
  );
  const memberRoutes: MetadataRoute.Sitemap = members.map((u) => ({
    url: `${BASE_URL}/community/${u.username}`,
    lastModified: new Date(u.created_at),
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  // /book/[slug] is the one meetings page meant to be found by search --
  // /book/manage/* (self-service reschedule/cancel) is intentionally
  // excluded here and disallowed in robots.ts, since it's only ever reached
  // via a private, per-booking confirmation-email link.
  const meetingTypes = await safeRows<{ slug: string; updated_at: string }>("meeting types", "SELECT slug, updated_at FROM meeting_types WHERE active = true");
  const meetingTypeRoutes: MetadataRoute.Sitemap = meetingTypes.map((m) => ({
    url: `${BASE_URL}/book/${m.slug}`,
    lastModified: new Date(m.updated_at),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const webinars = await safeRows<{ slug: string; updated_at: string }>("webinars", "SELECT slug, updated_at FROM webinars WHERE status = 'published'");
  const webinarRoutes: MetadataRoute.Sitemap = webinars.map((w) => ({
    url: `${BASE_URL}/webinars/${w.slug}`,
    lastModified: new Date(w.updated_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // Prompt & Skill Library: fully public as of 2026-09-20 (was login-gated).
  const libraryBrowseRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/resources/prompt-skill-library/browse`, changeFrequency: "weekly", priority: 0.6 },
  ];

  const prompts = await safeRows<{ slug: string; updated_at: string }>("prompts", "SELECT slug, updated_at FROM prompts WHERE status = 'published' AND show_in_library = true");
  const promptRoutes: MetadataRoute.Sitemap = prompts.map((p) => ({
    url: `${BASE_URL}/resources/prompt-skill-library/browse/prompts/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const skills = await safeRows<{ slug: string; updated_at: string }>("skills", "SELECT slug, updated_at FROM skills WHERE status = 'published' AND show_in_library = true");
  const skillRoutes: MetadataRoute.Sitemap = skills.map((s) => ({
    url: `${BASE_URL}/resources/prompt-skill-library/browse/skills/${s.slug}`,
    lastModified: new Date(s.updated_at),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const guides = await safeRows<{ slug: string; updated_at: string }>("guides", "SELECT slug, updated_at FROM prompt_guides WHERE status = 'published'");
  const guideRoutes: MetadataRoute.Sitemap = guides.map((g) => ({
    url: `${BASE_URL}/resources/prompt-skill-library/guides/${g.slug}`,
    lastModified: new Date(g.updated_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // Owner's own additions from /console/site-actions, for pages outside
  // every generator above. To remove something a generator already
  // includes, use that page's own "noindex" setting instead.
  const sitemapExtraUrls = await safePart("crawl settings", async () => (await getCrawlSettings()).sitemapExtraUrls, []);
  const extraRoutes: MetadataRoute.Sitemap = sitemapExtraUrls.map((path) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const allRoutes: MetadataRoute.Sitemap = [
    ...extraRoutes,
    ...builderRoutes,
    ...staticRoutes,
    ...courseRoutes,
    ...postRoutes,
    ...categoryRoutes,
    ...reviewerRoutes,
    ...authorRoutes,
    ...toolCategoryRoutes,
    ...toolRoutes,
    ...forumPostRoutes,
    ...memberRoutes,
    ...meetingTypeRoutes,
    ...webinarRoutes,
    ...libraryBrowseRoutes,
    ...promptRoutes,
    ...skillRoutes,
    ...guideRoutes,
  ];

  // Single filter point for every route above, rather than gating each
  // query individually: a managed page taken offline from Console -> Pages
  // drops out of the sitemap here, no matter which list above it came from.
  if (!offlinePrefixes.length) return allRoutes;
  return allRoutes.filter((route) => {
    const path = route.url.slice(BASE_URL.length) || "/";
    return !offlinePrefixes.some((p) => path === p || path.startsWith(`${p}/`));
  });
}
