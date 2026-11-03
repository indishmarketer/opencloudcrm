import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { pool } from "@/lib/db";
import { deleteFromR2, rehostImageFromUrl } from "@/lib/r2Upload";
import { courseUpdateSchema, evaluateCoursePublicationReadiness, parsePositiveId, validationMessage } from "@/lib/courseStudio";
import { ASSET_DOMAIN } from "@/config/brand";

type Params = { params: Promise<{ id: string }> };

function ownedCover(url: string): boolean {
  if (url.startsWith("/")) return true;
  try {
    const configured = process.env.R2_PUBLIC_URL;
    const origin = new URL(url).origin;
    return origin === `https://${ASSET_DOMAIN}` || (!!configured && origin === new URL(configured).origin);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "courses:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parsePositiveId((await params).id);
  if (!id) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  const [course, modules, lessons, resources] = await Promise.all([
    pool.query("SELECT * FROM courses WHERE id = $1", [id]),
    pool.query("SELECT id, title, description, tier, position FROM course_modules WHERE course_id = $1 ORDER BY position, id", [id]),
    pool.query("SELECT l.id, l.module_id, l.title, l.description, l.video_type, l.video_ref, l.position FROM course_lessons l JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = $1 ORDER BY m.position, l.position, l.id", [id]),
    pool.query("SELECT r.id, r.lesson_id, r.label, r.url, r.position FROM lesson_resources r JOIN course_lessons l ON l.id = r.lesson_id JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = $1 ORDER BY r.position, r.id", [id]),
  ]);
  if (!course.rows[0]) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  return NextResponse.json({
    course: course.rows[0],
    modules: modules.rows.map((module) => ({
      ...module,
      lessons: lessons.rows.filter((lesson) => lesson.module_id === module.id).map((lesson) => ({
        ...lesson,
        resources: resources.rows.filter((resource) => resource.lesson_id === lesson.id),
      })),
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "courses:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parsePositiveId((await params).id);
  if (!id) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  const parsed = courseUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const body = parsed.data;
  const currentResult = await pool.query("SELECT * FROM courses WHERE id = $1", [id]);
  const current = currentResult.rows[0];
  if (!current) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  if (body.slug && body.slug !== current.slug) {
    const duplicate = await pool.query("SELECT 1 FROM courses WHERE slug = $1 AND id <> $2", [body.slug, id]);
    if (duplicate.rowCount) return NextResponse.json({ error: "Another course already uses this slug." }, { status: 409 });
  }

  const candidate = { ...current, ...body };
  if (body.published === true) {
    const readiness = await pool.query(
      `SELECT count(DISTINCT m.id)::int AS module_count, count(DISTINCT l.id)::int AS lesson_count,
              bool_or(m.tier = 'pro') AS has_pro_tier,
              count(DISTINCT l.id) FILTER (WHERE l.video_ref IS NULL OR btrim(l.video_ref) = '')::int AS missing_video_count
       FROM course_modules m LEFT JOIN course_lessons l ON l.module_id = m.id WHERE m.course_id = $1`,
      [id],
    );
    const stats = readiness.rows[0];
    const issues = evaluateCoursePublicationReadiness({
      title: candidate.title, slug: candidate.slug, description: candidate.description,
      coverImageUrl: candidate.cover_image_url, moduleCount: stats.module_count || 0,
      lessonCount: stats.lesson_count || 0, hasProTier: stats.has_pro_tier === true,
      price: candidate.price, missingVideoCount: stats.missing_video_count || 0,
    });
    if (issues.length) return NextResponse.json({ error: issues[0], issues }, { status: 400 });
  }

  let cover = Object.hasOwn(body, "cover_image_url") ? body.cover_image_url || null : current.cover_image_url;
  if (cover && !ownedCover(cover)) {
    let parsedUrl: URL;
    try { parsedUrl = new URL(cover); } catch { return NextResponse.json({ error: "Cover image must be an HTTPS image URL." }, { status: 400 }); }
    if (parsedUrl.protocol !== "https:") return NextResponse.json({ error: "Cover image URLs must use HTTPS." }, { status: 400 });
    const imported = await rehostImageFromUrl(cover, `course-covers/${id}`);
    if (!imported) return NextResponse.json({ error: "Could not import that image. Use a public PNG, JPEG, GIF, or WEBP under 5MB." }, { status: 400 });
    cover = imported;
  }

  const result = await pool.query(
    `UPDATE courses SET title = COALESCE($1, title), slug = COALESCE($2, slug), subtitle = $3,
       description = $4, cover_image_url = $5, price = $6, price_currency = $7,
       published = COALESCE($8, published) WHERE id = $9 RETURNING *`,
    [body.title, body.slug, Object.hasOwn(body, "subtitle") ? body.subtitle : current.subtitle,
      Object.hasOwn(body, "description") ? body.description : current.description, cover,
      Object.hasOwn(body, "price") ? body.price : current.price,
      Object.hasOwn(body, "price_currency") ? body.price_currency : current.price_currency, body.published, id],
  );
  if (current.cover_image_url && current.cover_image_url !== cover && current.cover_image_url.includes(`/course-covers/${id}/`)) {
    await deleteFromR2(current.cover_image_url);
  }
  return NextResponse.json({ course: result.rows[0] });
}
