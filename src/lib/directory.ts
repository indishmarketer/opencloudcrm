import { pool } from "@/lib/db";

export type DirectoryCategory = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export type DirectoryTool = {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category_id: number;
  category_slug?: string;
  category_name?: string;
  subcategory: string | null;
  pricing_type: string;
  website_url: string;
  logo_url: string | null;
  screenshots: string[];
  screenshot_alts: Record<string, string>;
  featured: boolean;
  status: string;
  created_at: string;
};

export async function listCategories(): Promise<DirectoryCategory[]> {
  const result = await pool.query(
    "SELECT id, slug, name, description, sort_order FROM directory_categories ORDER BY sort_order ASC, name ASC"
  );
  return result.rows;
}

/**
 * Categories with how many live tools sit in each, for the browse grid on
 * /tools.
 *
 * A LEFT JOIN with the published filter in the ON clause, not the WHERE:
 * moving it to WHERE would turn this back into an inner join and silently
 * drop every empty category, which is exactly the set worth seeing when
 * deciding what the directory still needs.
 *
 * Empty ones are returned and the page decides whether to show them, so
 * that call stays in one place rather than being baked into the query.
 */
export async function listCategoriesWithCounts(): Promise<(DirectoryCategory & { tool_count: number })[]> {
  const result = await pool.query(
    `SELECT c.id, c.slug, c.name, c.description, c.sort_order,
            count(t.id)::int AS tool_count
     FROM directory_categories c
     LEFT JOIN directory_tools t ON t.category_id = c.id AND t.status = 'published'
     GROUP BY c.id, c.slug, c.name, c.description, c.sort_order
     ORDER BY c.sort_order ASC, c.name ASC`,
  );
  return result.rows;
}

export async function listPublishedTools(opts: {
  category?: string;
  subcategory?: string;
  pricing?: string;
  q?: string;
} = {}): Promise<DirectoryTool[]> {
  const conditions = ["t.status = 'published'"];
  const params: (string | number)[] = [];

  if (opts.category) {
    params.push(opts.category);
    conditions.push(`c.slug = $${params.length}`);
  }
  if (opts.subcategory) {
    params.push(opts.subcategory);
    conditions.push(`t.subcategory = $${params.length}`);
  }
  if (opts.pricing) {
    params.push(opts.pricing);
    conditions.push(`t.pricing_type = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q}%`);
    conditions.push(`(t.name ILIKE $${params.length} OR t.tagline ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
  }

  const result = await pool.query(
    `SELECT t.id, t.slug, t.name, t.tagline, t.description, t.category_id, c.slug AS category_slug,
            c.name AS category_name, t.subcategory, t.pricing_type, t.website_url, t.logo_url,
            t.screenshots, t.screenshot_alts, t.featured, t.status, t.created_at
     FROM directory_tools t
     JOIN directory_categories c ON c.id = t.category_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.featured DESC, t.name ASC`,
    params
  );
  return result.rows;
}

export async function getPublishedToolBySlug(slug: string): Promise<DirectoryTool | null> {
  const result = await pool.query(
    `SELECT t.id, t.slug, t.name, t.tagline, t.description, t.category_id, c.slug AS category_slug,
            c.name AS category_name, t.subcategory, t.pricing_type, t.website_url, t.logo_url,
            t.screenshots, t.screenshot_alts, t.featured, t.status, t.created_at
     FROM directory_tools t
     JOIN directory_categories c ON c.id = t.category_id
     WHERE t.slug = $1 AND t.status = 'published'`,
    [slug]
  );
  return result.rows[0] || null;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
