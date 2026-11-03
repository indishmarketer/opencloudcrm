import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { getAdminSessionEmail } from "@/lib/auth";
import { purgeCloudflareCache, submitUrlsForIndexing } from "@/lib/seoActions";
import { SITE_URL } from "@/config/brand";

/** Publishes a draft: from now on it shows on its page, the blog lists, the
 * sitemap and search, dated now. Then refreshes every cached page, clears
 * the Cloudflare cache and submits the URL for indexing. */
export async function POST(req: Request) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await req.json().catch(() => ({}));
  if (typeof slug !== "string") {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const result = await pool.query(
    `UPDATE blog_posts SET status = 'published', published_at = now(), published_by = $2, updated_at = now()
     WHERE slug = $1 AND status = 'draft'`,
    [slug, adminEmail]
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  revalidatePath("/", "layout");
  const url = `${SITE_URL}/blog/${slug}`;
  const [cache, indexing] = await Promise.all([
    purgeCloudflareCache().catch(() => ({ ok: false, message: "Cache purge failed." })),
    submitUrlsForIndexing([url]).catch(() => null),
  ]);

  return NextResponse.json({
    ok: true,
    url,
    cachePurged: cache.ok,
    indexingSubmitted: indexing ? indexing.submitted > 0 : false,
  });
}
