import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { deleteMuxAsset, muxWebhookIdentifiers, verifyMuxWebhookSignature } from "@/lib/mux";
import { sendWebinarProcessingFailedAlert } from "@/lib/webinarEmails";

type JsonRecord = Record<string, unknown>;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

function webhookSecret(): string | null {
  return process.env.MUX_WEBHOOK_SECRET || process.env.MUX_WEBHOOK_SIGNING_SECRET || null;
}

export async function POST(req: NextRequest) {
  const secret = webhookSecret();
  if (!secret && process.env.NODE_ENV === "production") return NextResponse.json({ error: "Mux webhook not configured." }, { status: 503 });
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 256 * 1024) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody) > 256 * 1024) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  if (secret && !verifyMuxWebhookSignature(rawBody, req.headers.get("mux-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: JsonRecord;
  try { event = JSON.parse(rawBody) as JsonRecord; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const type = text(event.type) || "";
  const data = event.data && typeof event.data === "object" ? event.data as JsonRecord : {};
  const { assetId, uploadId, passthrough } = muxWebhookIdentifiers(type, data);
  const playbackIds = Array.isArray(data.playback_ids) ? data.playback_ids as JsonRecord[] : [];
  const playbackId = text(playbackIds.find((item) => text(item.id))?.id) || text(data.playback_id);
  const durationNumber = Number(data.duration ?? data.duration_seconds);
  const duration = Number.isFinite(durationNumber) && durationNumber > 0 ? Math.round(durationNumber) : null;

  try {
    if (["video.upload.asset_created", "video.upload.asset_ready", "video.asset.created"].includes(type)) {
      if (uploadId && assetId) {
        await pool.query(
          `UPDATE webinars SET
             pending_mux_asset_id = CASE WHEN pending_mux_upload_id = $1 THEN $2 ELSE pending_mux_asset_id END,
             mux_asset_id = CASE WHEN mux_upload_id = $1 THEN $2 ELSE mux_asset_id END,
             updated_at = now()
           WHERE pending_mux_upload_id = $1 OR mux_upload_id = $1`,
          [uploadId, assetId],
        );
      } else if (assetId && passthrough) {
        await pool.query("UPDATE webinars SET pending_mux_asset_id = $2, updated_at = now() WHERE pending_mux_passthrough = $1", [passthrough, assetId]);
      }
      return NextResponse.json({ ok: true });
    }

    if (type === "video.asset.ready") {
      const lookup = await pool.query(
        `SELECT * FROM webinars
         WHERE ($1::text IS NOT NULL AND (pending_mux_upload_id = $1 OR mux_upload_id = $1))
            OR ($2::text IS NOT NULL AND (pending_mux_asset_id = $2 OR mux_asset_id = $2))
            OR ($3::text IS NOT NULL AND pending_mux_passthrough = $3)
         ORDER BY CASE WHEN pending_mux_upload_id = $1 OR pending_mux_asset_id = $2 THEN 0 ELSE 1 END
         LIMIT 1`,
        [uploadId, assetId, passthrough],
      );
      const webinar = lookup.rows[0];
      if (!webinar) return NextResponse.json({ ok: true, skipped: "unmatched asset" });
      const isPending = Boolean(
        (uploadId && webinar.pending_mux_upload_id === uploadId)
        || (assetId && webinar.pending_mux_asset_id === assetId)
        || (passthrough && webinar.pending_mux_passthrough === passthrough),
      );
      const previousAssetId = isPending ? webinar.mux_asset_id : null;
      if (isPending) {
        await pool.query(
          `UPDATE webinars SET
             mux_upload_id = COALESCE($2, pending_mux_upload_id),
             mux_asset_id = COALESCE($3, pending_mux_asset_id),
             mux_playback_id = COALESCE($4, mux_playback_id),
             duration_seconds = COALESCE($5, duration_seconds),
             pending_mux_upload_id = NULL,
             pending_mux_asset_id = NULL,
             pending_mux_passthrough = NULL,
             status = CASE WHEN status IN ('published','archived') THEN status ELSE 'ready' END,
             updated_at = now()
           WHERE id = $1`,
          [webinar.id, uploadId, assetId, playbackId, duration],
        );
      } else {
        await pool.query(
          `UPDATE webinars SET mux_asset_id = COALESCE($2, mux_asset_id), mux_playback_id = COALESCE($3, mux_playback_id),
             duration_seconds = COALESCE($4, duration_seconds),
             status = CASE WHEN status IN ('draft','processing','errored') THEN 'ready' ELSE status END, updated_at = now()
           WHERE id = $1`,
          [webinar.id, assetId, playbackId, duration],
        );
      }
      if (previousAssetId && assetId && previousAssetId !== assetId) {
        await deleteMuxAsset(previousAssetId).catch((error) => console.error("Old Mux asset cleanup failed:", error));
      }
      return NextResponse.json({ ok: true });
    }

    if (type === "video.asset.errored") {
      const errored = await pool.query(
        `UPDATE webinars SET
           pending_mux_upload_id = CASE WHEN pending_mux_upload_id = $1 OR pending_mux_asset_id = $2 THEN NULL ELSE pending_mux_upload_id END,
           pending_mux_asset_id = CASE WHEN pending_mux_upload_id = $1 OR pending_mux_asset_id = $2 THEN NULL ELSE pending_mux_asset_id END,
           pending_mux_passthrough = CASE WHEN pending_mux_upload_id = $1 OR pending_mux_asset_id = $2 OR pending_mux_passthrough = $3 THEN NULL ELSE pending_mux_passthrough END,
           status = CASE WHEN mux_playback_id IS NULL AND (mux_upload_id = $1 OR mux_asset_id = $2 OR pending_mux_upload_id = $1 OR pending_mux_asset_id = $2 OR pending_mux_passthrough = $3) THEN 'errored' ELSE status END,
           updated_at = now()
         WHERE mux_upload_id = $1 OR mux_asset_id = $2 OR pending_mux_upload_id = $1 OR pending_mux_asset_id = $2 OR pending_mux_passthrough = $3
         RETURNING id, title, status`,
        [uploadId, assetId, passthrough],
      );
      // Previously silent -- a failed upload/transcode sat there until the
      // owner happened to check the console. Only alert for a row that
      // actually flipped to errored (not one whose live published asset was
      // unaffected because a stale duplicate webhook matched it).
      for (const row of errored.rows) {
        if (row.status !== "errored") continue;
        sendWebinarProcessingFailedAlert({ webinarId: row.id, webinarTitle: row.title }).catch((err) => console.error("Webinar processing failure alert failed:", err));
      }
      return NextResponse.json({ ok: true });
    }

    if (type === "video.asset.deleted" && assetId) {
      await pool.query(
        `UPDATE webinars SET mux_asset_id = NULL, mux_playback_id = NULL, duration_seconds = NULL,
           status = CASE WHEN status = 'archived' THEN status ELSE 'errored' END, updated_at = now()
         WHERE mux_asset_id = $1`,
        [assetId],
      );
      await pool.query(
        `UPDATE webinars SET pending_mux_upload_id = NULL, pending_mux_asset_id = NULL,
           pending_mux_passthrough = NULL, updated_at = now()
         WHERE pending_mux_asset_id = $1`,
        [assetId],
      );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true, skipped: "irrelevant event" });
  } catch (error) {
    console.error("Mux webhook processing failed:", error);
    return NextResponse.json({ error: "Failed to process webhook." }, { status: 500 });
  }
}
