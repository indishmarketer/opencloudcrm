import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { authorizeRequest } from "@/lib/apiTokens";
import { pool, isUniqueViolation } from "@/lib/db";
import { getAllPostsIncludingDrafts } from "@/lib/blogPosts";
import { validateBlogPostBody, isForeignKeyViolation, normalizeBlogSources } from "@/lib/blogPostValidation";

/** List every post (drafts included) -- the same data the console's blog
 * list page shows, available to anything with a blog:read token or an
 * admin session, so an external tool/MCP client can "see their pages"
 * without needing console access. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "blog:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ posts: await getAllPostsIncludingDrafts() });
}

/** Create a post -- the same validation and columns as the console's own
 * blog editor (src/app/api/console/blog/route.ts), just reachable with a
 * blog:write token instead of only an admin session cookie. This is the
 * literal "create their page... using MCP server" case. */
export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, "blog:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const validationError = await validateBlogPostBody(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const {
    slug, title, html, status, category, author_slug,
    feature_image, feature_image_alt, excerpt, meta_title, meta_description, og_image,
  } = body as Record<string, string | undefined>;
  const published = status === "published";
  const sources = normalizeBlogSources((body as Record<string, unknown>).sources);
  // A token has no email to attribute to -- "api" marks it distinctly
  // from any human admin's own email in published_by.
  const publishedBy = auth.via === "session" ? auth.email : "api";

  try {
    const result = await pool.query(
      `INSERT INTO blog_posts
         (id, slug, title, html, excerpt, feature_image, og_image, meta_title, meta_description, category, author_slug, status, published_at, published_by, sources, sources_reviewed_at, feature_image_alt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CASE WHEN $15::jsonb <> '[]'::jsonb THEN now()::date ELSE NULL END, $16)
       RETURNING slug`,
      [
        randomUUID(), slug, title!.trim(), html, excerpt || null, feature_image || null, og_image || null,
        meta_title || null, meta_description || null, category, author_slug || null, status,
        published ? new Date() : null, published ? publishedBy : null, JSON.stringify(sources), feature_image_alt || null,
      ]
    );
    revalidatePath("/", "layout");
    return NextResponse.json({ slug: result.rows[0].slug });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That slug is already in use." }, { status: 409 });
    }
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: "Unknown author." }, { status: 400 });
    }
    throw err;
  }
}
