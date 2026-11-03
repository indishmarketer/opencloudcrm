import { pool } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2Upload";

export function extractBlogImageUrls(html: string | null | undefined): string[] {
  if (!html) return [];
  return Array.from(html.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi), (match) => match[2])
    .filter((url) => url.startsWith("https://"));
}

/** Remove old R2 objects only after the database no longer references them
 * anywhere in blog posts. This keeps reused photos alive and ignores URLs
 * that are hosted outside our own R2 bucket. */
export async function deleteUnreferencedBlogImages(urls: Array<string | null | undefined>) {
  const candidates = [...new Set(urls.filter((url): url is string => !!url && url.startsWith("https://")))];
  if (candidates.length === 0) return;

  try {
    const unused = await pool.query<{ url: string }>(
      `SELECT candidate.url
         FROM unnest($1::text[]) AS candidate(url)
        WHERE NOT EXISTS (
          SELECT 1
            FROM blog_posts AS post
           WHERE post.feature_image = candidate.url
              OR post.og_image = candidate.url
              OR position(candidate.url IN COALESCE(post.html, '')) > 0
        ) AND NOT EXISTS (
          SELECT 1
            FROM site_settings AS setting
            CROSS JOIN LATERAL jsonb_array_elements(setting.value::jsonb) AS category(item)
           WHERE setting.key = 'blog_categories'
             AND item ->> 'image' = candidate.url
        )`,
      [candidates]
    );
    await Promise.all(unused.rows.map(({ url }) => deleteFromR2(url)));
  } catch {
    // Cleanup is best-effort; saving the post matters more than removing an
    // orphaned image if R2 or the reference check has a temporary failure.
  }
}
