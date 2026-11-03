import { getPostBySlug, getPublicPostsWithHtml, type BlogIndexEntry } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { pool } from "@/lib/db";
import type { DirectoryTool } from "@/lib/directory";

type PostIndexEntry = BlogIndexEntry;
type MinimalTool = {
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  pricing_type: string;
  category_slug: string;
  category_name: string;
};


function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function wordsOverlap(a: string, b: string): boolean {
  const stop = new Set(["and", "the", "for", "with", "tools", "tool", "apps", "app"]);
  const wordsA = a.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w));
  const wordsB = b.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w));
  return wordsA.some((w) => wordsB.includes(w));
}

/** Finds blog posts worth linking from a directory tool page. No manual
 * tagging needed, a post qualifies if any of these match: the tool's name
 * is mentioned in the post title/excerpt (strong signal), the tool's
 * website is linked from the post body, the tool's name appears anywhere
 * in the post body, or the tool's category loosely overlaps the post's
 * blog category. Scored so the strongest match wins when there are more
 * than a few candidates, but each type of match alone is enough to
 * qualify a post at all. */
export async function getRelatedPostsForTool(
  tool: Pick<DirectoryTool, "name" | "website_url" | "category_name">,
  limit = 3
): Promise<PostIndexEntry[]> {
  const nameRe = new RegExp(`\\b${escapeRegex(tool.name)}\\b`, "i");
  const domain = domainOf(tool.website_url);
  const categoryNameBySlug = new Map((await getBlogCategories()).map((c) => [c.slug, c.name.toLowerCase()]));

  const scored = (await getPublicPostsWithHtml()).map((post) => {
    let score = 0;
    if (nameRe.test(post.title) || nameRe.test(post.excerpt || "")) score += 5;

    const html = post.html || "";
    if (domain && html.includes(domain)) score += 4;
    if (nameRe.test(html)) score += 2;

    const postCategoryName = categoryNameBySlug.get(post.category) || "";
    if (postCategoryName && tool.category_name && wordsOverlap(tool.category_name, postCategoryName)) score += 1;

    return { post, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.post.published_at).getTime() - new Date(a.post.published_at).getTime())
    .slice(0, limit)
    .map((s) => s.post);
}

/** The reverse direction of getRelatedPostsForTool -- given a blog post,
 * finds published directory tools worth linking from it. Same matching
 * rules, just run against every published tool instead of every post, so
 * a blog post automatically starts surfacing tools the moment they're
 * published in the directory, no manual editing of existing post content
 * needed. */
export async function getRelatedToolsForPost(
  post: Pick<PostIndexEntry, "slug" | "title" | "excerpt" | "category">,
  limit = 3
): Promise<MinimalTool[]> {
  const categoryNameBySlug = new Map((await getBlogCategories()).map((c) => [c.slug, c.name.toLowerCase()]));
  const full = await getPostBySlug(post.slug);
  const html = full?.html || "";
  const postCategoryName = categoryNameBySlug.get(post.category) || "";

  const result = await pool.query(
    `SELECT t.slug, t.name, t.tagline, t.logo_url, t.pricing_type, t.website_url, c.slug AS category_slug, c.name AS category_name
     FROM directory_tools t
     JOIN directory_categories c ON c.id = t.category_id
     WHERE t.status = 'published'`
  );

  const scored = result.rows.map((tool) => {
    let score = 0;
    const nameRe = new RegExp(`\\b${escapeRegex(tool.name)}\\b`, "i");
    if (nameRe.test(post.title) || nameRe.test(post.excerpt || "")) score += 5;

    const domain = domainOf(tool.website_url);
    if (domain && html.includes(domain)) score += 4;
    if (nameRe.test(html)) score += 2;

    if (postCategoryName && wordsOverlap(tool.category_name, postCategoryName)) score += 1;

    return { tool, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.tool);
}
