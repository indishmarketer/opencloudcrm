import type { MetadataRoute } from "next";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { getCuratedReviewers } from "@/lib/curatedReviews";
import { authors } from "@/data/authors";
import { pool } from "@/lib/db";
import { PUBLIC_SITE_PAGES } from "@/lib/publicSitePages";
import { listPublishedPageEntries } from "@/lib/sitePages";
import { BUILT_IN_PATHS } from "@/lib/defaultPages";
import { SITE_URL as BASE_URL } from "@/config/brand";
import { buildSafe } from "@/lib/db";
import { getCrawlSettings } from "@/lib/siteCrawlSettings";

export const revalidate = 3600; // Revalidate every hour to keep in sync with DB

// See the build-phase note on buildSafe (src/lib/db.ts): a fresh
// self-host install's database may not be migrated yet when this runs
// during `next build`, and it's better to ship an empty sitemap that
// fills in on the next revalidation than to fail the whole production
// build over it.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSafe(buildSitemap, []);
}

async function buildSitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = PUBLIC_SITE_PAGES
    .filter((p) => !p.noindex)
    .map(({ url, changeFrequency, priority }) => ({
      url: `${BASE_URL}${url}`,
      changeFrequency,
      priority,
    }));

  // Built-in routes are already listed above; only add builder pages.
  const builderRoutes: MetadataRoute.Sitemap = (await listPublishedPageEntries())
    .filter((p) => !BUILT_IN_PATHS.has(p.path))
    .map((p) => ({
      url: `${BASE_URL}${p.path === "/" ? "" : p.path}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: p.path === "/" ? "weekly" : "monthly",
      priority: p.path === "/" ? 1 : 0.6,
    }));

  const courses = await pool.query("SELECT slug FROM courses WHERE published = true");
  const courseRoutes: MetadataRoute.Sitemap = courses.rows.map((c) => ({
    url: `${BASE_URL}/courses/${c.slug}`,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // Drafts stay out until they are published from /console/blog.
  const postRoutes: MetadataRoute.Sitemap = (await getPublicPosts()).map((p) => ({
    url: `${BASE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.published_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = (await getBlogCategories()).map((c) => ({
    url: `${BASE_URL}/blog/category/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const reviewerRoutes: MetadataRoute.Sitemap = (await getCuratedReviewers()).map((r) => ({
    url: `${BASE_URL}/reviews/${r.slug}`,
    changeFrequency: "yearly",
    priority: 0.4,
  }));

  const authorRoutes: MetadataRoute.Sitemap = Object.values(authors).map((a) => ({
    url: `${BASE_URL}/author/${a.slug}`,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  const directoryCategories = await pool.query(
    "SELECT c.slug FROM directory_categories c WHERE EXISTS (SELECT 1 FROM directory_tools t WHERE t.category_id = c.id AND t.status = 'published')"
  );
  const toolCategoryRoutes: MetadataRoute.Sitemap = directoryCategories.rows.map((c) => ({
    url: `${BASE_URL}/tools/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const tools = await pool.query(
    "SELECT t.slug, c.slug AS category_slug, t.updated_at FROM directory_tools t JOIN directory_categories c ON c.id = t.category_id WHERE t.status = 'published'"
  );
  const toolRoutes: MetadataRoute.Sitemap = tools.rows.map((t) => ({
    url: `${BASE_URL}/tools/${t.category_slug}/${t.slug}`,
    lastModified: new Date(t.updated_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const forumPosts = await pool.query(
    "SELECT id, created_at FROM forum_posts WHERE space = 'general' AND status = 'approved'"
  );
  const forumPostRoutes: MetadataRoute.Sitemap = forumPosts.rows.map((p) => ({
    url: `${BASE_URL}/community/general/${p.id}`,
    lastModified: new Date(p.created_at),
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const members = await pool.query(
    "SELECT username, created_at FROM users WHERE username IS NOT NULL AND id NOT IN (SELECT user_id FROM community_bans)"
  );
  const memberRoutes: MetadataRoute.Sitemap = members.rows.map((u) => ({
    url: `${BASE_URL}/community/${u.username}`,
    lastModified: new Date(u.created_at),
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  // /book/[slug] is the one meetings page meant to be found by search --
  // /book/manage/* (self-service reschedule/cancel) is intentionally
  // excluded here and disallowed in robots.ts, since it's only ever reached
  // via a private, per-booking confirmation-email link.
  const meetingTypes = await pool.query("SELECT slug, updated_at FROM meeting_types WHERE active = true");
  const meetingTypeRoutes: MetadataRoute.Sitemap = meetingTypes.rows.map((m) => ({
    url: `${BASE_URL}/book/${m.slug}`,
    lastModified: new Date(m.updated_at),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const webinars = await pool.query("SELECT slug, updated_at FROM webinars WHERE status = 'published'");
  const webinarRoutes: MetadataRoute.Sitemap = webinars.rows.map((w) => ({
    url: `${BASE_URL}/webinars/${w.slug}`,
    lastModified: new Date(w.updated_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // Prompt & Skill Library: fully public as of 2026-09-20 (was login-gated).
  const libraryBrowseRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/resources/prompt-skill-library/browse`, changeFrequency: "weekly", priority: 0.6 },
  ];

  const prompts = await pool.query("SELECT slug, updated_at FROM prompts WHERE status = 'published' AND show_in_library = true");
  const promptRoutes: MetadataRoute.Sitemap = prompts.rows.map((p) => ({
    url: `${BASE_URL}/resources/prompt-skill-library/browse/prompts/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const skills = await pool.query("SELECT slug, updated_at FROM skills WHERE status = 'published' AND show_in_library = true");
  const skillRoutes: MetadataRoute.Sitemap = skills.rows.map((s) => ({
    url: `${BASE_URL}/resources/prompt-skill-library/browse/skills/${s.slug}`,
    lastModified: new Date(s.updated_at),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const guides = await pool.query("SELECT slug, updated_at FROM prompt_guides WHERE status = 'published'");
  const guideRoutes: MetadataRoute.Sitemap = guides.rows.map((g) => ({
    url: `${BASE_URL}/resources/prompt-skill-library/guides/${g.slug}`,
    lastModified: new Date(g.updated_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // Owner's own additions from /console/site-actions, for pages outside
  // every generator above. To remove something a generator already
  // includes, use that page's own "noindex" setting instead.
  const { sitemapExtraUrls } = await getCrawlSettings();
  const extraRoutes: MetadataRoute.Sitemap = sitemapExtraUrls.map((path) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [
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
}
