import { cache } from "react";
import { createHmac, timingSafeEqual } from "crypto";
import { pool } from "@/lib/db";
import { getSessionSecret } from "@/lib/sessionSecret";
import { SITE_URL } from "@/lib/liveSiteUrl";

/** The listing shape used by every public surface (blog lists, sitemap,
 * search, related posts, nav) -- a subset of the full `blog_posts` row. */
export type BlogIndexEntry = {
  slug: string;
  title: string;
  excerpt: string | null;
  feature_image: string | null;
  published_at: string;
  category: string;
  status?: string;
  /** blog_authors slug for a guest post; the default author when absent. */
  author?: string;
};

export type BlogSource = { label: string; url: string };

/** The full `blog_posts` row, including body HTML and SEO fields. */
export type BlogPostRow = {
  id: string;
  slug: string;
  title: string;
  html: string;
  excerpt: string | null;
  feature_image: string | null;
  feature_image_alt: string | null;
  og_image: string | null;
  meta_title: string | null;
  meta_description: string | null;
  category: string;
  author_slug: string | null;
  status: string;
  published_at: string | null;
  updated_at: string;
  sources: BlogSource[];
  sources_reviewed_at: string | null;
};

type DbRow = {
  id: string;
  slug: string;
  title: string;
  html: string;
  excerpt: string | null;
  feature_image: string | null;
  feature_image_alt: string | null;
  og_image: string | null;
  meta_title: string | null;
  meta_description: string | null;
  category: string;
  author_slug: string | null;
  status: string;
  published_at: Date | null;
  updated_at: Date;
  created_at: Date;
  sources: BlogSource[];
  sources_reviewed_at: Date | null;
};

const SELECT_COLUMNS =
  "id, slug, title, html, excerpt, feature_image, feature_image_alt, og_image, meta_title, meta_description, category, author_slug, status, published_at, updated_at, created_at, sources, sources_reviewed_at";

function toRow(r: DbRow): BlogPostRow {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    html: r.html,
    excerpt: r.excerpt,
    feature_image: r.feature_image,
    feature_image_alt: r.feature_image_alt,
    og_image: r.og_image,
    meta_title: r.meta_title,
    meta_description: r.meta_description,
    category: r.category,
    author_slug: r.author_slug,
    status: r.status,
    published_at: r.published_at ? r.published_at.toISOString() : null,
    updated_at: r.updated_at.toISOString(),
    sources: Array.isArray(r.sources) ? r.sources : [],
    sources_reviewed_at: r.sources_reviewed_at ? r.sources_reviewed_at.toISOString().slice(0, 10) : null,
  };
}

function toIndexEntry(r: BlogPostRow): BlogIndexEntry {
  return {
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    feature_image: r.feature_image,
    published_at: r.published_at || r.updated_at,
    category: r.category,
    status: r.status,
    author: r.author_slug || undefined,
  };
}

/** The public post list, newest first. */
export const getPublicPosts = cache(async (): Promise<BlogIndexEntry[]> => {
  const { rows } = await pool.query<DbRow>(
    `SELECT ${SELECT_COLUMNS} FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC`
  );
  return rows.map((r) => toIndexEntry(toRow(r)));
});

export async function getPublicPost(slug: string): Promise<BlogIndexEntry | undefined> {
  return (await getPublicPosts()).find((p) => p.slug === slug);
}

/** Drafts not yet published, for the console. */
export const getUnpublishedDrafts = cache(async (): Promise<BlogIndexEntry[]> => {
  const { rows } = await pool.query<DbRow>(
    `SELECT ${SELECT_COLUMNS} FROM blog_posts WHERE status = 'draft' ORDER BY created_at DESC`
  );
  return rows.map((r) => toIndexEntry(toRow(r)));
});

/** Every post, drafts included. Console use only. */
export const getAllPostsIncludingDrafts = cache(async (): Promise<BlogIndexEntry[]> => {
  const { rows } = await pool.query<DbRow>(
    `SELECT ${SELECT_COLUMNS} FROM blog_posts ORDER BY created_at DESC`
  );
  return rows.map((r) => toIndexEntry(toRow(r)));
});

/** The full row (body HTML + SEO fields) for one post, any status. */
export const getPostBySlug = cache(async (slug: string): Promise<BlogPostRow | null> => {
  const { rows } = await pool.query<DbRow>(
    `SELECT ${SELECT_COLUMNS} FROM blog_posts WHERE slug = $1`,
    [slug]
  );
  return rows[0] ? toRow(rows[0]) : null;
});

/** Every public post's listing fields plus its body HTML, in one query --
 * for callers that need to scan post bodies (e.g. matching a directory tool
 * name/domain against every post). Avoids one query per post. */
export const getPublicPostsWithHtml = cache(async (): Promise<(BlogIndexEntry & { html: string })[]> => {
  const { rows } = await pool.query<DbRow>(
    `SELECT ${SELECT_COLUMNS} FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC`
  );
  return rows.map((r) => {
    const row = toRow(r);
    return { ...toIndexEntry(row), html: row.html };
  });
});

/** Key for a draft's private preview link, so it can be shown to someone
 * without a console login. Tied to the slug, so it can't open other drafts. */
export function draftPreviewKey(slug: string): string {
  return createHmac("sha256", getSessionSecret()).update(`blog-preview:${slug}`).digest("hex").slice(0, 32);
}

export function isValidDraftPreviewKey(slug: string, key: string | undefined): boolean {
  if (!key) return false;
  const expected = Buffer.from(draftPreviewKey(slug));
  const given = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The link to open to see this post: the signed preview page for a draft,
 * the live post for anything published. */
export function blogPreviewUrl(slug: string, status: string): string {
  return status === "published"
    ? `${SITE_URL}/blog/${slug}`
    : `${SITE_URL}/blog/preview/${slug}?key=${draftPreviewKey(slug)}`;
}
