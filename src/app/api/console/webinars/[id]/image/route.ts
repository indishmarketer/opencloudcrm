import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";
import { deleteFromR2, uploadImageToR2 } from "@/lib/r2Upload";

function imageKind(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "thumbnail" && kind !== "presenter") return null;
  return kind;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId) || webinarId < 1) return NextResponse.json({ error: "Invalid webinar." }, { status: 400 });
  const kind = imageKind(req);
  if (!kind) return NextResponse.json({ error: "Invalid image type." }, { status: 400 });
  const field = kind === "presenter" ? "presenter_image_url" : "thumbnail_url";
  const webinarResult = await pool.query("SELECT slug FROM webinars WHERE id = $1", [webinarId]);
  const webinar = webinarResult.rows[0];
  if (!webinar) return NextResponse.json({ error: "Webinar not found." }, { status: 404 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });

  let uploaded: Awaited<ReturnType<typeof uploadImageToR2>>;
  try {
    uploaded = await uploadImageToR2(file, `webinars/${webinarId}/${kind}`);
  } catch {
    return NextResponse.json({ error: "The image upload failed. Please try again." }, { status: 502 });
  }
  if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });
  let previous: string | null;
  try {
    previous = await withTransaction(async (client) => {
      const current = await client.query(`SELECT ${field} AS previous_url FROM webinars WHERE id = $1 FOR UPDATE`, [webinarId]);
      if (!current.rows[0]) throw new Error("Webinar disappeared during image upload.");
      await client.query(`UPDATE webinars SET ${field} = $2, updated_at = now() WHERE id = $1`, [webinarId, uploaded.url]);
      return current.rows[0].previous_url as string | null;
    });
  } catch (error) {
    await deleteFromR2(uploaded.url);
    throw error;
  }
  if (previous && previous !== uploaded.url) await deleteFromR2(previous);
  // The library can be statically rendered, unlike an authenticated webinar
  // landing page. Invalidate both views when artwork changes.
  revalidatePath("/webinars");
  revalidatePath(`/webinars/${webinar.slug}`);
  return NextResponse.json({ ok: true, url: uploaded.url, kind });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId) || webinarId < 1) return NextResponse.json({ error: "Invalid webinar." }, { status: 400 });
  const kind = imageKind(req);
  if (!kind) return NextResponse.json({ error: "Invalid image type." }, { status: 400 });
  const field = kind === "presenter" ? "presenter_image_url" : "thumbnail_url";
  const previousUrl = await withTransaction(async (client) => {
    const previousResult = await client.query(`SELECT ${field} AS previous_url FROM webinars WHERE id = $1 FOR UPDATE`, [webinarId]);
    if (!previousResult.rows[0]) return undefined;
    await client.query(`UPDATE webinars SET ${field} = NULL, updated_at = now() WHERE id = $1`, [webinarId]);
    return previousResult.rows[0].previous_url as string | null;
  });
  if (previousUrl === undefined) return NextResponse.json({ error: "Webinar not found." }, { status: 404 });
  if (previousUrl) await deleteFromR2(previousUrl);
  const webinarResult = await pool.query("SELECT slug FROM webinars WHERE id = $1", [webinarId]);
  const webinar = webinarResult.rows[0];
  if (webinar) {
    revalidatePath("/webinars");
    revalidatePath(`/webinars/${webinar.slug}`);
  }
  return NextResponse.json({ ok: true, kind });
}
