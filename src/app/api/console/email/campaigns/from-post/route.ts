import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getPostBySlug } from "@/lib/blogPosts";
import { buildNewsletterHtmlFromPost } from "@/lib/blogNewsletter";

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug, name } = await req.json();
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120) {
    return NextResponse.json({ error: "Enter a campaign name (up to 120 characters)." }, { status: 400 });
  }
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "A blog post slug is required." }, { status: 400 });
  }

  const post = await getPostBySlug(slug);
  if (!post) return NextResponse.json({ error: "Blog post not found." }, { status: 404 });

  const html = buildNewsletterHtmlFromPost({
    slug: post.slug,
    title: post.title,
    html: post.html,
    feature_image: post.feature_image,
    custom_excerpt: post.excerpt,
  });
  const result = await pool.query(
    `INSERT INTO newsletter_campaigns (name, subject, html, status, segment_id, source_post_slug)
     VALUES ($1, $2, $3, 'draft',
       (SELECT id FROM contact_segments WHERE name = 'All marketable contacts' AND is_system = true LIMIT 1),
       $4)
     RETURNING id`,
    [name.trim(), post.meta_title || post.title, html, post.slug]
  );
  return NextResponse.json({ id: result.rows[0].id });
}
