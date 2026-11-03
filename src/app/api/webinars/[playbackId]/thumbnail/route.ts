import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSignedMuxThumbnailUrl } from "@/lib/mux";

/** A published webinar's public cover fallback. Playback itself stays protected. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ playbackId: string }> }) {
  const { playbackId } = await params;
  if (!playbackId) return NextResponse.json({ error: "Missing playback ID." }, { status: 400 });
  const result = await pool.query(
    "SELECT 1 FROM webinars WHERE mux_playback_id = $1 AND status = 'published' LIMIT 1",
    [playbackId],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Webinar not found." }, { status: 404 });
  try {
    return NextResponse.redirect(await getSignedMuxThumbnailUrl(playbackId, { time: 1, width: 1280 }));
  } catch (error) {
    console.error("Signed webinar thumbnail URL error:", error);
    return NextResponse.json({ error: "Could not prepare the webinar cover." }, { status: 500 });
  }
}
