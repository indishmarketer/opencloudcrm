import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";
import { deleteFromR2, rehostImageFromUrl } from "@/lib/r2Upload";
import { deleteCourseVideos } from "@/lib/courseVideoStorage";
import {
  courseUpdateSchema,
  evaluateCoursePublicationReadiness,
  parsePositiveId,
  validationMessage,
} from "@/lib/courseStudio";
import { ASSET_DOMAIN } from "@/config/brand";

function isOwnedOrLocalCover(value: string): boolean {
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    const configured = process.env.R2_PUBLIC_URL;
    return url.origin === `https://${ASSET_DOMAIN}` || (!!configured && url.origin === new URL(configured).origin);
  } catch {
    return false;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const courseId = parsePositiveId(id);
  if (!courseId) return NextResponse.json({ error: "Invalid course." }, { status: 400 });

  const parsed = courseUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const body = parsed.data;
  const currentResult = await pool.query("SELECT * FROM courses WHERE id = $1", [courseId]);
  const current = currentResult.rows[0];
  if (!current) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  if (body.slug && body.slug !== current.slug) {
    const slugConflict = await pool.query("SELECT 1 FROM courses WHERE slug = $1 AND id <> $2 LIMIT 1", [body.slug, courseId]);
    if (slugConflict.rowCount) return NextResponse.json({ error: "Another course already uses this slug." }, { status: 409 });
  }

  const candidate = { ...current, ...body };
  if (body.published === true) {
    const readiness = await pool.query(
      `SELECT count(DISTINCT m.id)::int AS module_count,
              count(DISTINCT l.id)::int AS lesson_count,
              bool_or(m.tier = 'pro') AS has_pro_tier,
              count(DISTINCT l.id) FILTER (WHERE l.video_ref IS NULL OR btrim(l.video_ref) = '')::int AS missing_video_count
       FROM course_modules m LEFT JOIN course_lessons l ON l.module_id = m.id
       WHERE m.course_id = $1`,
      [courseId],
    );
    const stats = readiness.rows[0];
    const issues = evaluateCoursePublicationReadiness({
      title: candidate.title,
      slug: candidate.slug,
      description: candidate.description,
      coverImageUrl: candidate.cover_image_url,
      moduleCount: stats.module_count || 0,
      lessonCount: stats.lesson_count || 0,
      hasProTier: stats.has_pro_tier === true,
      price: candidate.price,
      missingVideoCount: stats.missing_video_count || 0,
    });
    if (issues.length > 0) return NextResponse.json({ error: issues[0], issues }, { status: 400 });
  }

  let coverImageUrl = Object.hasOwn(body, "cover_image_url") ? body.cover_image_url || null : current.cover_image_url;
  if (coverImageUrl && !isOwnedOrLocalCover(coverImageUrl)) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(coverImageUrl);
    } catch {
      return NextResponse.json({ error: "Cover image must be a valid image URL or uploaded file." }, { status: 400 });
    }
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json({ error: "Cover image URLs must use HTTPS." }, { status: 400 });
    }
    const rehosted = await rehostImageFromUrl(coverImageUrl, `course-covers/${courseId}`);
    if (!rehosted) return NextResponse.json({ error: "Could not import that image URL. Check that it is a public PNG, JPEG, GIF, or WEBP under 5MB." }, { status: 400 });
    coverImageUrl = rehosted;
  }

  const result = await pool.query(
    `UPDATE courses SET
      title = COALESCE($1, title),
      slug = COALESCE($2, slug),
      subtitle = $3,
      description = $4,
      cover_image_url = $5,
      price = $6,
      price_currency = $7,
      published = COALESCE($8, published)
     WHERE id = $9
     RETURNING *`,
    [
      body.title,
      body.slug,
      Object.hasOwn(body, "subtitle") ? body.subtitle : current.subtitle,
      Object.hasOwn(body, "description") ? body.description : current.description,
      coverImageUrl,
      Object.hasOwn(body, "price") ? body.price : current.price,
      Object.hasOwn(body, "price_currency") ? body.price_currency : current.price_currency,
      body.published,
      courseId,
    ],
  );

  if (current.cover_image_url && current.cover_image_url !== coverImageUrl && current.cover_image_url.includes(`/course-covers/${courseId}/`)) {
    await deleteFromR2(current.cover_image_url);
  }

  return NextResponse.json({ ok: true, course: result.rows[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const courseId = parsePositiveId((await params).id);
  if (!courseId) return NextResponse.json({ error: "Invalid course." }, { status: 400 });

  const deleted = await withTransaction(async (client) => {
    const courseResult = await client.query("SELECT id, title, published, cover_image_url FROM courses WHERE id = $1 FOR UPDATE", [courseId]);
    const course = courseResult.rows[0];
    if (!course) return { error: "Course not found.", status: 404 as const };
    if (course.published) return { error: "Unpublish this course before deleting it.", status: 409 as const };

    const blockers = await client.query(
      `SELECT
        (SELECT count(*)::int FROM course_enrollments WHERE course_id = $1) AS enrollments,
        (SELECT count(*)::int FROM payment_claims WHERE course_id = $1) AS payment_claims,
        (SELECT count(*)::int FROM email_flows WHERE course_id = $1 AND archived_at IS NULL) AS email_flows,
        (SELECT count(*)::int FROM course_waitlist_signups WHERE course_slug = $2) AS waitlist_signups`,
      [courseId, course.slug],
    );
    const counts = blockers.rows[0];
    if (counts.enrollments || counts.payment_claims || counts.email_flows || counts.waitlist_signups) {
      return {
        error: "This draft has enrollments, payment records, waitlist signups, or active email flows and cannot be safely deleted. Remove those dependencies or keep the course as a draft.",
        status: 409 as const,
      };
    }

    const videos = await client.query(
      `SELECT DISTINCT l.video_ref FROM course_lessons l
       JOIN course_modules m ON m.id = l.module_id
       WHERE m.course_id = $1 AND l.video_type = 'r2' AND l.video_ref IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM course_lessons other
           JOIN course_modules om ON om.id = other.module_id
           WHERE other.video_type = 'r2' AND other.video_ref = l.video_ref AND om.course_id <> $1
         )`,
      [courseId],
    );
    await client.query("DELETE FROM courses WHERE id = $1", [courseId]);
    return { course, videoKeys: videos.rows.map((row) => row.video_ref as string) };
  });

  if ("error" in deleted) return NextResponse.json({ error: deleted.error }, { status: deleted.status });
  if (deleted.course.cover_image_url) await deleteFromR2(deleted.course.cover_image_url);
  await deleteCourseVideos(deleted.videoKeys);
  return NextResponse.json({ ok: true });
}
