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

// The blog itself (author/[slug], the byline on every post) is public,
// SEO-relevant, and must never break because of a DB hiccup -- these two
// reads fall back to the pre-existing hardcoded author so the site keeps
// working exactly as it did before this table existed.
export async function listActiveAuthorSlugs(): Promise<string[]> {
  try {
    const result = await pool.query(`SELECT slug FROM blog_authors WHERE is_active = true`);
    const slugs = new Set(result.rows.map((r) => r.slug as string));
    Object.keys(staticAuthors).forEach((s) => slugs.add(s));
    return Array.from(slugs);
  } catch {
    return Object.keys(staticAuthors);
  }
}

export async function getAuthorViewBySlug(slug: string): Promise<Author | null> {
  try {
    const result = await pool.query(`SELECT * FROM blog_authors WHERE slug = $1 AND is_active = true`, [slug]);
    if (result.rows[0]) return toAuthorView(result.rows[0]);
  } catch {
    // fall through to static
  }
  return staticAuthors[slug] || null;
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
