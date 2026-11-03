import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getSignedMuxPlaybackUrl } from "@/lib/mux";
import { canWatchWebinar } from "@/lib/webinars";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { webinarSessionState } from "@/lib/webinarSession";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ playbackId: string }> }) {
  const { playbackId } = await params;
  if (!playbackId) return NextResponse.json({ error: "Missing playback ID." }, { status: 400 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in to enter this webinar room." }, { status: 401 });

  const webinarResult = await pool.query("SELECT * FROM webinars WHERE mux_playback_id = $1 LIMIT 1", [playbackId]);
  const webinar = webinarResult.rows[0];
  if (!webinar) return NextResponse.json({ error: "Webinar not found." }, { status: 404 });

  const isOwner = isConsoleOwner(session.email);
  let hasRegistered = !webinar.requires_registration;
  let hasProAccess = webinar.access_tier !== "pro" || isOwner;
  let registration: { session_start_at?: string } | null = null;
  if (webinar.requires_registration) {
    const access = await pool.query("SELECT session_start_at FROM webinar_access WHERE user_id = $1 AND webinar_id = $2", [session.userId, webinar.id]);
    registration = access.rows[0] || null;
    hasRegistered = Boolean(access.rowCount) || isOwner;
  }
  if (webinar.access_tier === "pro" && !isOwner) {
    const entitlement = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE user_id = $1 AND tier = 'pro') AS has_pro_course,
              EXISTS(SELECT 1 FROM community_memberships WHERE user_id = $1 AND status = 'active' AND (current_period_end IS NULL OR current_period_end > now())) AS has_membership`,
      [session.userId],
    );
    hasProAccess = Boolean(entitlement.rows[0]?.has_pro_course || entitlement.rows[0]?.has_membership);
  }
  const gate = canWatchWebinar({ webinar, isOwner, hasRegistered, hasProAccess });
  if (!gate.allowed) return NextResponse.json({ error: "You do not have access to this webinar room.", reason: gate.reason }, { status: 403 });
  if (!isOwner) {
    if (!registration?.session_start_at) return NextResponse.json({ error: "Reserve a webinar session first." }, { status: 409 });
    if (webinarSessionState(registration.session_start_at, Number(webinar.duration_seconds || 0)).phase === "ended") return NextResponse.json({ error: "This webinar session has ended." }, { status: 410 });
  }

  try {
    const url = await getSignedMuxPlaybackUrl(playbackId);
    await pool.query("UPDATE webinar_access SET last_viewed_at = now() WHERE webinar_id = $1 AND user_id = $2", [webinar.id, session.userId]).catch(() => undefined);
    return NextResponse.json({ url }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("Signed playback URL error:", error);
    return NextResponse.json({ error: "Could not prepare the webinar video." }, { status: 500 });
  }
}
