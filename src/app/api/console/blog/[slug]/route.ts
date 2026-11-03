import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool, isUniqueViolation } from "@/lib/db";
import { deleteUnreferencedBlogImages, extractBlogImageUrls } from "@/lib/blogImageCleanup";
import { validateBlogPostBody, isForeignKeyViolation, normalizeBlogSources } from "@/lib/blogPostValidation";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug: currentSlug } = await params;
  const body = await req.json().catch(() => ({}));
  const validationError = await validateBlogPostBody(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const {
    slug: newSlug, title, html, status, category, author_slug,
    feature_image, feature_image_alt, excerpt, meta_title, meta_description, og_image,
  } = body as Record<string, string | undefined>;
  const sources = normalizeBlogSources((body as Record<string, unknown>).sources);

  const existing = await pool.query<{
    status: string;
    html: string;
    feature_image: string | null;
    og_image: string | null;
    sources: { label: string; url: string }[];
  }>("SELECT status, html, feature_image, og_image, sources FROM blog_posts WHERE slug = $1", [currentSlug]);
  const previous = existing.rows[0];
  if (!previous) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  // Only bump "last reviewed" when the sources list actually changed --
  // not on every unrelated save (a typo fix shouldn't reset the
  // freshness signal this date exists to give).
  const sourcesChanged = JSON.stringify(sources) !== JSON.stringify(previous.sources || []);

  // The slug is only editable while still a draft -- changing it once
  // published would break the post's indexed URL and any backlinks.
  let targetSlug = currentSlug;
  if (newSlug !== currentSlug) {
    if (previous.status === "published") {
      return NextResponse.json({ error: "Can't change the slug of a published post." }, { status: 400 });
    }
    targetSlug = newSlug!;
  }

  const willPublishNow = status === "published" && previous.status !== "published";

  try {
    await pool.query(
      `UPDATE blog_posts SET
         slug = $1, title = $2, html = $3, excerpt = $4, feature_image = $5, og_image = $6,
         meta_title = $7, meta_description = $8, category = $9, author_slug = $10, status = $11,
         sources = $15,
         sources_reviewed_at = CASE
           WHEN $16 AND $15::jsonb <> '[]'::jsonb THEN now()::date
           WHEN $15::jsonb = '[]'::jsonb THEN NULL
           ELSE sources_reviewed_at
         END,
         published_at = CASE WHEN $12 THEN now() ELSE published_at END,
         published_by = CASE WHEN $12 THEN $13 ELSE published_by END,
         feature_image_alt = $17,
         updated_at = now()
       WHERE slug = $14`,
      [
        targetSlug, title!.trim(), html, excerpt || null, feature_image || null, og_image || null,
        meta_title || null, meta_description || null, category, author_slug || null, status,
        willPublishNow, adminEmail, currentSlug, JSON.stringify(sources), sourcesChanged, feature_image_alt || null,
      ]
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That slug is already in use." }, { status: 409 });
    }
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: "Unknown author." }, { status: 400 });
    }
    throw err;
  }

  await deleteUnreferencedBlogImages([
    ...extractBlogImageUrls(previous.html),
    previous.feature_image,
    previous.og_image,
  ]);

  revalidatePath("/", "layout");
  return NextResponse.json({ slug: targetSlug });
}

/** Deleting a published post is allowed, but requires the caller to pass
 * confirmPublishedDelete:true -- a second, server-side guard on top of the
 * console's own confirm dialog, since this removes a live, possibly
 * search-indexed URL (it drops out of the sitemap on its next
 * regeneration, within the hour per sitemap.ts's revalidate window). A
 * draft needs no such flag; deleting one was always casual. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const body = await req.json().catch(() => ({})) as { confirmPublishedDelete?: boolean };

  const existing = await pool.query<{ status: string }>("SELECT status FROM blog_posts WHERE slug = $1", [slug]);
  if (!existing.rows[0]) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (existing.rows[0].status === "published" && !body.confirmPublishedDelete) {
    return NextResponse.json({ error: "Deleting a published post needs confirmation." }, { status: 400 });
  }

  const result = await pool.query<{ html: string; feature_image: string | null; og_image: string | null }>(
    "DELETE FROM blog_posts WHERE slug = $1 RETURNING html, feature_image, og_image",
    [slug]
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }
  const deleted = result.rows[0];
  await deleteUnreferencedBlogImages([
    ...extractBlogImageUrls(deleted.html),
    deleted.feature_image,
    deleted.og_image,
  ]);

  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
