import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { webinarCreateSchema, parseReleaseAt, validationMessage } from "@/lib/webinarStudio";

const webinarSelect = `SELECT w.*,
  (SELECT count(*)::int FROM webinar_access wa WHERE wa.webinar_id = w.id) AS registration_count,
  (SELECT count(*)::int FROM webinar_comments wc WHERE wc.webinar_id = w.id AND wc.is_question = true) AS question_count,
  (SELECT count(*)::int FROM webinar_schedules ws WHERE ws.webinar_id = w.id AND ws.active = true) AS active_schedule_count
  FROM webinars w`;

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query(`${webinarSelect} ORDER BY w.updated_at DESC`);
  return NextResponse.json({ webinars: result.rows }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = webinarCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const data = parsed.data;
  try {
    const inserted = await pool.query(
      `INSERT INTO webinars
       (slug, title, subtitle, description, thumbnail_url, presenter_name, presenter_title, presenter_bio,
        presenter_image_url, audience, key_takeaways, agenda, cta_label, cta_url, seo_title, seo_description,
        featured, access_tier, requires_registration, release_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,'draft')
       RETURNING id`,
      [
        data.slug, data.title, data.subtitle || null, data.description || null, data.thumbnail_url || null,
        data.presenter_name || null, data.presenter_title || null, data.presenter_bio || null,
        data.presenter_image_url || null, data.audience || null, JSON.stringify(data.key_takeaways || []),
        JSON.stringify(data.agenda || []), data.cta_label || null, data.cta_url || null,
        data.seo_title || null, data.seo_description || null, data.featured ?? false,
        data.access_tier ?? "free", data.requires_registration ?? true, parseReleaseAt(data.release_at ?? null),
      ],
    );
    const result = await pool.query(`${webinarSelect} WHERE w.id = $1`, [inserted.rows[0].id]);
    revalidatePath("/webinars");
    return NextResponse.json({ webinar: result.rows[0] }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "A webinar with this slug already exists." }, { status: 409 });
    console.error("Create webinar error:", error);
    return NextResponse.json({ error: "Failed to create webinar." }, { status: 500 });
  }
}
