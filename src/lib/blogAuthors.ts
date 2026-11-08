import { pool } from "@/lib/db";
import { slugify } from "@/lib/promptLibrary";
import type { Author } from "@/data/authors";
import { authors as staticAuthors, defaultAuthorSlug } from "@/data/authors";

export type SocialLink = { label: string; url: string };

export type BlogAuthor = {
  id: number;
  slug: string;
  name: string;
  role: string | null;
  bio: string | null;
  avatar_url: string | null;
  social_links: SocialLink[];
  is_active: boolean;
  application_id: number | null;
  created_at: string;
  updated_at: string;
};

export function parseSocialLinks(input: unknown): SocialLink[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((l): l is SocialLink => l && typeof l.label === "string" && typeof l.url === "string" && l.label.trim() !== "" && l.url.trim() !== "")
    .map((l) => ({ label: l.label.trim().slice(0, 40), url: l.url.trim().slice(0, 500) }));
}

export function toAuthorView(row: BlogAuthor): Author {
  return {
    slug: row.slug,
    name: row.name,
    role: row.role || "",
    bio: row.bio || "",
    avatar: row.avatar_url,
    social: row.social_links,
  };
}

export async function listBlogAuthors(): Promise<BlogAuthor[]> {
  const result = await pool.query(`SELECT * FROM blog_authors ORDER BY created_at DESC`);
  return result.rows;
}

// listActiveAuthorSlugs/getAuthorViewBySlug feed a public, SEO-relevant
// page (author/[slug]) and generateStaticParams, and must never fail a
// build or a request over a DB hiccup -- but "the DB is unreachable right
// now" (fall back to the static placeholder so something still renders)
// is a different case from "the DB answered: no such active author"
// (a real 404, not neutral placeholder copy pretending to be a real
// profile). Mixing the two used to mean /author/site-owner was always a
// live, empty, indexable page on every deployment, configured or not.
export async function listActiveAuthorSlugs(): Promise<string[]> {
  try {
    const result = await pool.query(`SELECT slug FROM blog_authors WHERE is_active = true`);
    return result.rows.map((r) => r.slug as string);
  } catch {
    // DB unreachable (e.g. `next build` with no DB yet) -- the static
    // placeholder keeps generateStaticParams from failing the build.
    return Object.keys(staticAuthors);
  }
}

export async function getAuthorViewBySlug(slug: string): Promise<Author | null> {
  try {
    const result = await pool.query(`SELECT * FROM blog_authors WHERE slug = $1 AND is_active = true`, [slug]);
    return result.rows[0] ? toAuthorView(result.rows[0]) : null;
  } catch {
    // DB unreachable -- same build-time safety net as above.
    return staticAuthors[slug] || null;
  }
}

/** The slug every post without an explicit author falls back to.
 *
 * `defaultAuthorSlug` (from data/authors.ts) is a fixed, neutral string
 * ("site-owner") so the public repo ships with no one's real identity --
 * but the console's "Add an author" form generates its slug from whatever
 * name is typed (see blogAuthors.createBlogAuthor -> uniqueSlug), which is
 * essentially never "site-owner". A self-hoster who fills that form out
 * exactly as instructed still never sees it picked up by their own
 * unassigned posts: this resolves to the DB row for the fixed slug if one
 * exists, else the earliest-created active author (the common case: the
 * one person running the blog), else the fixed slug unchanged (fresh
 * install, nothing configured yet). */
export async function resolveDefaultAuthorSlug(): Promise<string> {
  try {
    const exact = await pool.query(`SELECT 1 FROM blog_authors WHERE slug = $1 AND is_active = true`, [defaultAuthorSlug]);
    if (exact.rowCount) return defaultAuthorSlug;
    const earliest = await pool.query<{ slug: string }>(
      `SELECT slug FROM blog_authors WHERE is_active = true ORDER BY created_at ASC LIMIT 1`
    );
    if (earliest.rows[0]) return earliest.rows[0].slug;
  } catch {
    // fall through to the fixed default
  }
  return defaultAuthorSlug;
}

export async function getDefaultAuthorView(): Promise<Author> {
  const view = await getAuthorViewBySlug(await resolveDefaultAuthorSlug());
  return view || staticAuthors[defaultAuthorSlug];
}

/** Every author that should be discoverable (sitemap, site search): active
 * DB-configured authors only -- an unconfigured install has no real author
 * page to find, so nothing is listed until one exists (same reasoning as
 * getAuthorViewBySlug: the static placeholder is a build-time safety net,
 * never content real visitors or crawlers should be pointed at). */
export async function listDiscoverableAuthors(): Promise<Author[]> {
  try {
    const result = await pool.query(`SELECT * FROM blog_authors WHERE is_active = true`);
    return result.rows.map(toAuthorView);
  } catch {
    return [];
  }
}

async function uniqueSlug(name: string, excludeId?: number): Promise<string> {
  const base = slugify(name) || "author";
  let candidate = base;
  let n = 2;
  for (;;) {
    const result = await pool.query(
      `SELECT id FROM blog_authors WHERE slug = $1 ${excludeId ? "AND id != $2" : ""}`,
      excludeId ? [candidate, excludeId] : [candidate]
    );
    if (result.rows.length === 0) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

export async function getBlogAuthorById(id: number): Promise<BlogAuthor | null> {
  const result = await pool.query(`SELECT * FROM blog_authors WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function createBlogAuthor(data: {
  name: string;
  role: string | null;
  bio: string | null;
  avatar_url: string | null;
  social_links: SocialLink[];
  application_id: number | null;
}): Promise<BlogAuthor> {
  const slug = await uniqueSlug(data.name);
  const result = await pool.query(
    `INSERT INTO blog_authors (slug, name, role, bio, avatar_url, social_links, application_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [slug, data.name, data.role, data.bio, data.avatar_url, JSON.stringify(data.social_links), data.application_id]
  );
  return result.rows[0];
}

export async function updateBlogAuthor(
  id: number,
  data: { name: string; role: string | null; bio: string | null; avatar_url: string | null; social_links: SocialLink[]; is_active: boolean }
): Promise<BlogAuthor | null> {
  const result = await pool.query(
    `UPDATE blog_authors SET name = $1, role = $2, bio = $3, avatar_url = $4, social_links = $5, is_active = $6, updated_at = now()
     WHERE id = $7 RETURNING *`,
    [data.name, data.role, data.bio, data.avatar_url, JSON.stringify(data.social_links), data.is_active, id]
  );
  return result.rows[0] || null;
}

export async function deleteBlogAuthor(id: number): Promise<void> {
  await pool.query(`DELETE FROM blog_authors WHERE id = $1`, [id]);
}
