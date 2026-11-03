import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { cancelMuxDirectUpload, deleteMuxAsset } from "@/lib/mux";
import { deleteFromR2 } from "@/lib/r2Upload";
import { getWebinarReadiness, parseReleaseAt, validationMessage, webinarUpdateSchema } from "@/lib/webinarStudio";

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const webinarSelect = `SELECT w.*,
  (SELECT count(*)::int FROM webinar_access wa WHERE wa.webinar_id = w.id) AS registration_count,
  (SELECT count(*)::int FROM webinar_comments wc WHERE wc.webinar_id = w.id AND wc.is_question = true) AS question_count,
  (SELECT count(*)::int FROM webinar_schedules ws WHERE ws.webinar_id = w.id AND ws.active = true) AS active_schedule_count
  FROM webinars w`;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const webinarId = parseId((await params).id);
  if (!webinarId) return NextResponse.json({ error: "Invalid webinar." }, { status: 400 });
  const parsed = webinarUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });

  const currentResult = await pool.query(
    `SELECT w.*, (SELECT count(*)::int FROM webinar_schedules ws WHERE ws.webinar_id = w.id AND ws.active = true) AS active_schedule_count
     FROM webinars w WHERE w.id = $1`,
    [webinarId],
  );
  const current = currentResult.rows[0];
  if (!current) return NextResponse.json({ error: "Webinar not found." }, { status: 404 });
  const data = parsed.data;

  if (data.status === "published") {
    const readiness = getWebinarReadiness({ ...current, ...data });
    if (readiness.length) return NextResponse.json({ error: `Complete the publishing checklist: ${readiness.join(", ")}.`, readiness }, { status: 409 });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  const add = (field: string, value: unknown, cast = "") => {
    values.push(value);
    fields.push(`${field} = $${values.length}${cast}`);
  };
  const textFields = ["title", "slug", "subtitle", "description", "thumbnail_url", "presenter_name", "presenter_title", "presenter_bio", "presenter_image_url", "audience", "cta_label", "cta_url", "seo_title", "seo_description"] as const;
  for (const field of textFields) {
    if (Object.hasOwn(data, field)) add(field, data[field]?.trim() || null);
  }
  if (Object.hasOwn(data, "key_takeaways")) add("key_takeaways", JSON.stringify(data.key_takeaways || []), "::jsonb");
  if (Object.hasOwn(data, "agenda")) add("agenda", JSON.stringify(data.agenda || []), "::jsonb");
  if (data.featured !== undefined) add("featured", data.featured);
  if (data.access_tier !== undefined) add("access_tier", data.access_tier);
  if (data.requires_registration !== undefined) add("requires_registration", data.requires_registration);
  if (Object.hasOwn(data, "release_at")) add("release_at", parseReleaseAt(data.release_at ?? null));
  if (data.status !== undefined) add("status", data.status);

  if (!fields.length) {
    const result = await pool.query(`${webinarSelect} WHERE w.id = $1`, [webinarId]);
    return NextResponse.json({ webinar: result.rows[0] });
  }
  fields.push("updated_at = now()");
  values.push(webinarId);
  try {
    await pool.query(`UPDATE webinars SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
    const result = await pool.query(`${webinarSelect} WHERE w.id = $1`, [webinarId]);
    revalidatePath("/webinars");
    revalidatePath(`/webinars/${current.slug}`);
    if (data.slug && data.slug !== current.slug) revalidatePath(`/webinars/${data.slug}`);
    return NextResponse.json({ webinar: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "Another webinar already uses this slug." }, { status: 409 });
    console.error("Update webinar error:", error);
    return NextResponse.json({ error: "Could not save the webinar." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const webinarId = parseId((await params).id);
  if (!webinarId) return NextResponse.json({ error: "Invalid webinar." }, { status: 400 });
  const result = await pool.query("SELECT * FROM webinars WHERE id = $1", [webinarId]);
  const webinar = result.rows[0];
  if (!webinar) return NextResponse.json({ error: "Webinar not found." }, { status: 404 });

  await pool.query("DELETE FROM webinars WHERE id = $1", [webinarId]);
  await Promise.all([
    webinar.thumbnail_url ? deleteFromR2(webinar.thumbnail_url) : Promise.resolve(),
    webinar.presenter_image_url ? deleteFromR2(webinar.presenter_image_url) : Promise.resolve(),
    webinar.pending_mux_upload_id ? cancelMuxDirectUpload(webinar.pending_mux_upload_id).catch((error) => console.error("Mux upload cleanup failed:", error)) : Promise.resolve(),
    webinar.mux_asset_id ? deleteMuxAsset(webinar.mux_asset_id).catch((error) => console.error("Mux asset cleanup failed:", error)) : Promise.resolve(),
    webinar.pending_mux_asset_id ? deleteMuxAsset(webinar.pending_mux_asset_id).catch((error) => console.error("Pending Mux asset cleanup failed:", error)) : Promise.resolve(),
  ]);
  revalidatePath("/webinars");
  revalidatePath(`/webinars/${webinar.slug}`);
  return NextResponse.json({ ok: true });
}
