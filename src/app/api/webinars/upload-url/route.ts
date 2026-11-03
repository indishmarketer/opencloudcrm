import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { cancelMuxDirectUpload, createMuxDirectUpload, deleteMuxAsset } from "@/lib/mux";

const requestSchema = z.object({ webinarId: z.coerce.number().int().positive() });

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a webinar before uploading." }, { status: 400 });
  const webinarResult = await pool.query("SELECT id FROM webinars WHERE id = $1", [parsed.data.webinarId]);
  const webinar = webinarResult.rows[0];
  if (!webinar) return NextResponse.json({ error: "Webinar not found." }, { status: 404 });

  let createdUploadId: string | null = null;
  try {
    const passthrough = `webinar:${webinar.id}:${randomUUID()}`;
    const upload = await createMuxDirectUpload({
      corsOrigin: req.headers.get("origin") || undefined,
      passthrough,
    });
    createdUploadId = upload.id;
    const replaced = await pool.query(
      `WITH previous AS (
         SELECT id, pending_mux_upload_id, pending_mux_asset_id FROM webinars WHERE id = $1 FOR UPDATE
       ), updated AS (
         UPDATE webinars w SET pending_mux_upload_id = $2, pending_mux_asset_id = NULL,
           pending_mux_passthrough = $3,
           status = CASE WHEN w.mux_playback_id IS NULL THEN 'processing' ELSE w.status END,
           updated_at = now()
         FROM previous p WHERE w.id = p.id RETURNING w.id
       )
       SELECT p.pending_mux_upload_id, p.pending_mux_asset_id FROM previous p JOIN updated u ON u.id = p.id`,
      [webinar.id, upload.id, passthrough],
    );
    const previous = replaced.rows[0] || {};
    await Promise.all([
      previous.pending_mux_upload_id ? cancelMuxDirectUpload(previous.pending_mux_upload_id).catch((cleanupError) => console.error("Old Mux upload cleanup failed:", cleanupError)) : Promise.resolve(),
      previous.pending_mux_asset_id ? deleteMuxAsset(previous.pending_mux_asset_id).catch((cleanupError) => console.error("Old pending Mux asset cleanup failed:", cleanupError)) : Promise.resolve(),
    ]);
    return NextResponse.json({ url: upload.url, uploadId: upload.id, webinarId: webinar.id });
  } catch (error) {
    if (createdUploadId) {
      await cancelMuxDirectUpload(createdUploadId).catch((cleanupError) => console.error("New Mux upload cleanup failed:", cleanupError));
    }
    console.error("Mux upload URL error:", error);
    const message = error instanceof Error ? error.message : "Could not prepare the video upload.";
    return NextResponse.json({ error: message.includes("not configured") ? "Video storage is not configured." : "Could not prepare the video upload." }, { status: message.includes("not configured") ? 503 : 502 });
  }
}
