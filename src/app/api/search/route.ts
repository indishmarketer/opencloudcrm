import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { getCuratedReviewers } from "@/lib/curatedReviews";
import { authors } from "@/data/authors";
import { PUBLIC_SITE_PAGES, rankSearchResults, type SearchResult } from "@/lib/publicSitePages";
import { listPublishedPageEntries } from "@/lib/sitePages";
import { BUILT_IN_PATHS } from "@/lib/defaultPages";
import { consumeRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

const QUERY_LIMIT = 12;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = z.string().trim().min(1).max(100).safeParse(searchParams.get("q"));

  if (!parsed.success) return NextResponse.json({ results: [] });

  const query = parsed.data;
  const pattern = `%${query.replace(/\s+/g, "%")}%`;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await consumeRateLimit(`search:${ip}`, 60, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many searches." }, { status: 429 });
  }

  // Only records that have a public page are queried. Console, account,
  // webinar room, checkout, and token-only URLs are deliberately absent.
  const [courses, tools, webinars, meetingTypes, communityPosts, prompts, skills, guides] = await Promise.all([
    pool.query(
      `SELECT slug, title, COALESCE(subtitle, description) AS description
       FROM courses
       WHERE published = true AND concat_ws(' ', title, subtitle, description, slug) ILIKE $1
       LIMIT ${QUERY_LIMIT}`,
      [pattern],
    ),
    pool.query(
      `SELECT t.slug, t.name, COALESCE(t.tagline, t.description) AS description, c.slug AS category_slug
       FROM directory_tools t
       JOIN directory_categories c ON c.id = t.category_id
       WHERE t.status = 'published'
         AND concat_ws(' ', t.name, t.tagline, t.description, t.slug, c.slug) ILIKE $1
       LIMIT ${QUERY_LIMIT}`,
      [pattern],
    ),
    pool.query(
      `SELECT slug, title, COALESCE(subtitle, description, seo_description) AS description
       FROM webinars
       WHERE status = 'published' AND concat_ws(' ', title, subtitle, description, seo_title, seo_description, slug) ILIKE $1
       LIMIT ${QUERY_LIMIT}`,
      [pattern],
    ),
    pool.query(
      `SELECT slug, name, description
       FROM meeting_types
       WHERE active = true AND concat_ws(' ', name, description, slug) ILIKE $1
       LIMIT ${QUERY_LIMIT}`,
      [pattern],
    ),
    pool.query(
      `SELECT id, title, body
       FROM forum_posts
       WHERE space = 'general' AND status = 'approved'
         AND concat_ws(' ', title, body) ILIKE $1
       LIMIT ${QUERY_LIMIT}`,
      [pattern],
    ),
    pool.query(
      `SELECT slug, title, description
       FROM prompts
       WHERE status = 'published' AND show_in_library = true AND concat_ws(' ', title, description, prompt_text) ILIKE $1
       LIMIT ${QUERY_LIMIT}`,
      [pattern],
    ),
    pool.query(
      `SELECT slug, title, description
       FROM skills
       WHERE status = 'published' AND show_in_library = true AND concat_ws(' ', title, description, skill_markdown) ILIKE $1
       LIMIT ${QUERY_LIMIT}`,
      [pattern],
    ),
    pool.query(
      `SELECT slug, title, description
       FROM prompt_guides
       WHERE status = 'published' AND concat_ws(' ', title, description, body) ILIKE $1
       LIMIT ${QUERY_LIMIT}`,
      [pattern],
    ),
  ]);

  const databaseResults: SearchResult[] = [
    ...courses.rows.map((row) => ({ type: "course", title: row.title, desc: row.description, url: `/courses/${row.slug}` })),
    ...tools.rows.map((row) => ({ type: "tool", title: row.name, desc: row.description, url: `/tools/${row.category_slug}/${row.slug}` })),
    ...webinars.rows.map((row) => ({ type: "webinar", title: row.title, desc: row.description, url: `/webinars/${row.slug}` })),
    ...meetingTypes.rows.map((row) => ({ type: "booking", title: row.name, desc: row.description, url: `/book/${row.slug}` })),
    ...communityPosts.rows.map((row) => ({ type: "community", title: row.title, desc: row.body, url: `/community/general/${row.id}` })),
    ...prompts.rows.map((row) => ({ type: "prompt", title: row.title, desc: row.description, url: `/resources/prompt-skill-library/browse/prompts/${row.slug}` })),
    ...skills.rows.map((row) => ({ type: "skill", title: row.title, desc: row.description, url: `/resources/prompt-skill-library/browse/skills/${row.slug}` })),
    ...guides.rows.map((row) => ({ type: "guide", title: row.title, desc: row.description, url: `/resources/prompt-skill-library/guides/${row.slug}` })),
  ];

  const staticContent: SearchResult[] = [
    ...PUBLIC_SITE_PAGES.map(({ type, title, desc, url }) => ({ type, title, desc, url })),
    ...(await listPublishedPageEntries())
      .filter((p) => !BUILT_IN_PATHS.has(p.path))
      .map((p) => ({ type: "page", title: p.title, desc: p.description || null, url: p.path })),
    ...(await getPublicPosts()).map((post) => ({ type: "blog", title: post.title, desc: post.excerpt || null, url: `/blog/${post.slug}` })),
    ...(await getBlogCategories()).map((category) => ({ type: "blog", title: category.name, desc: category.description || null, url: `/blog/category/${category.slug}` })),
    ...(await getCuratedReviewers()).map((reviewer) => ({ type: "review", title: `${reviewer.name} review`, desc: reviewer.bio, url: `/reviews/${reviewer.slug}` })),
    ...Object.values(authors).map((author) => ({ type: "author", title: author.name, desc: author.bio, url: `/author/${author.slug}` })),
  ];

  return NextResponse.json({ results: rankSearchResults([...databaseResults, ...staticContent], query) });
}
