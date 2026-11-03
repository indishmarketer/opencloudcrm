import { NextRequest, NextResponse } from "next/server";
import { isUniqueViolation, pool } from "@/lib/db";
import { getAdminSessionEmail } from "@/lib/auth";
import { deleteUnreferencedBlogImages, extractBlogImageUrls } from "@/lib/blogImageCleanup";
import { blogPreviewUrl } from "@/lib/blogPosts";
import { isForeignKeyViolation, normalizeBlogSources } from "@/lib/blogPostValidation";
import { getBlogCategories } from "@/lib/blogCategories";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body.id);
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid draft identifier." }, { status: 400 });

  const title = text(body.title).trim() || "Untitled post";
  const html = text(body.html) || "<p></p>";
  const requestedSlug = slugify(text(body.slug)) || slugify(title) || `untitled-${id.slice(0, 8)}`;
  if (!SLUG_RE.test(requestedSlug)) return NextResponse.json({ error: "Enter a valid post URL." }, { status: 400 });
  const categories = await getBlogCategories();
  const category = categories.some((item) => item.slug === text(body.category)) ? text(body.category) : categories[0]?.slug || "";
  if (!category) return NextResponse.json({ error: "No blog categories are configured." }, { status: 400 });
  const authorSlug = text(body.author_slug).trim() || null;
  const excerpt = text(body.excerpt).slice(0, 200) || null;
  const featureImage = text(body.feature_image).trim() || null;
  const featureImageAlt = text(body.feature_image_alt).trim() || null;
  const ogImage = text(body.og_image).trim() || null;
  const metaTitle = text(body.meta_title).trim() || null;
  const metaDescription = text(body.meta_description).trim() || null;
  const sources = normalizeBlogSources(body.sources);
  const sourcesReviewedAt = sources.length ? new Date().toISOString().slice(0, 10) : null;

  try {
    const existing = await pool.query<{
      id: string;
      slug: string;
      status: string;
      html: string;
      feature_image: string | null;
      og_image: string | null;
    }>("SELECT id, slug, status, html, feature_image, og_image FROM blog_posts WHERE id = $1", [id]);

    if (existing.rows[0]?.status === "published") {
      return NextResponse.json({ error: "Published posts need the Update button to save changes." }, { status: 409 });
    }

    if (existing.rows[0]) {
      const saved = await pool.query(
        `UPDATE blog_posts
            SET slug = $1, title = $2, html = $3, excerpt = $4, feature_image = $5, og_image = $6,
                meta_title = $7, meta_description = $8, category = $9, author_slug = $10,
                sources = $12, sources_reviewed_at = $13, feature_image_alt = $14, updated_at = now()
          WHERE id = $11 AND status = 'draft'
          RETURNING id`,
        [requestedSlug, title, html, excerpt, featureImage, ogImage, metaTitle, metaDescription, category, authorSlug, id, JSON.stringify(sources), sourcesReviewedAt, featureImageAlt]
      );
      if (saved.rowCount === 0) {
        return NextResponse.json({ error: "This post changed status. Reload before saving again." }, { status: 409 });
      }
      const removedImages = [
        ...extractBlogImageUrls(existing.rows[0].html).filter((url) => !html.includes(url)),
        existing.rows[0].feature_image !== featureImage ? existing.rows[0].feature_image : null,
        existing.rows[0].og_image !== ogImage ? existing.rows[0].og_image : null,
      ];
      await deleteUnreferencedBlogImages(removedImages);
      return NextResponse.json({ id, slug: requestedSlug, previewUrl: blogPreviewUrl(requestedSlug, "draft"), savedAt: new Date().toISOString() });
    }

    const slugCollision = await pool.query("SELECT 1 FROM blog_posts WHERE slug = $1 LIMIT 1", [requestedSlug]);
    const slug = slugCollision.rowCount ? `${requestedSlug}-${id.slice(0, 8)}` : requestedSlug;
    await pool.query(
      `INSERT INTO blog_posts
         (id, slug, title, html, excerpt, feature_image, og_image, meta_title, meta_description, category, author_slug, status, sources, sources_reviewed_at, feature_image_alt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', $12, $13, $14)`,
      [id, slug, title, html, excerpt, featureImage, ogImage, metaTitle, metaDescription, category, authorSlug, JSON.stringify(sources), sourcesReviewedAt, featureImageAlt]
    );
    return NextResponse.json({ id, slug, previewUrl: blogPreviewUrl(slug, "draft"), savedAt: new Date().toISOString() }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: "That slug is already in use." }, { status: 409 });
    if (isForeignKeyViolation(err)) return NextResponse.json({ error: "Choose an active author." }, { status: 400 });
    throw err;
  }
}
