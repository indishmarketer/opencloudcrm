import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import WebinarRoom from "@/components/WebinarRoom";
import { getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";
import { canWatchWebinar, type Webinar } from "@/lib/webinars";

export const metadata: Metadata = { title: "Webinar room", robots: { index: false, follow: false } };

export default async function WebinarRoomPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?redirect=${encodeURIComponent(`/webinars/${slug}/room`)}`);

  const [webinarResult, userResult] = await Promise.all([
    pool.query<Webinar>("SELECT * FROM webinars WHERE slug = $1 LIMIT 1", [slug]),
    pool.query("SELECT name, email FROM users WHERE id = $1 LIMIT 1", [session.userId]),
  ]);
  const webinar = webinarResult.rows[0];
  if (!webinar) notFound();
  const isOwner = isConsoleOwner(session.email);
  const preview = isOwner && (await searchParams).preview === "1";
  const registration = await pool.query("SELECT session_start_at, attendee_timezone FROM webinar_access WHERE webinar_id = $1 AND user_id = $2 LIMIT 1", [webinar.id, session.userId]);
  const hasRegistered = !webinar.requires_registration || Boolean(registration.rowCount) || isOwner;
  let hasProAccess = webinar.access_tier !== "pro" || isOwner;
  if (webinar.access_tier === "pro" && !isOwner) {
    const entitlement = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE user_id = $1 AND tier = 'pro') AS has_pro_course,
              EXISTS(SELECT 1 FROM community_memberships WHERE user_id = $1 AND status = 'active' AND (current_period_end IS NULL OR current_period_end > now())) AS has_membership`,
      [session.userId],
    );
    hasProAccess = Boolean(entitlement.rows[0]?.has_pro_course || entitlement.rows[0]?.has_membership);
  }
  const gate = canWatchWebinar({ webinar, isOwner, hasRegistered, hasProAccess });
  if (!gate.allowed) redirect(`/webinars/${slug}`);
  if (!webinar.mux_playback_id) notFound();

  const [scheduleCount, eventsResult] = await Promise.all([
    pool.query("SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS server_now"),
    pool.query(
      `SELECT e.*, r.selected_option, r.response_text
       FROM webinar_timed_events e
       LEFT JOIN webinar_event_responses r ON r.event_id = e.id AND r.user_id = $2
       WHERE e.webinar_id = $1 AND e.active = true
       ORDER BY e.trigger_seconds, e.id`,
      [webinar.id, session.userId],
    ),
  ]);
  const sessionStartAt = preview ? new Date(Number(scheduleCount.rows[0]?.server_now)).toISOString() : registration.rows[0]?.session_start_at ? new Date(registration.rows[0].session_start_at).toISOString() : null;
  if (!isOwner && !sessionStartAt) redirect(`/webinars/${slug}`);

  const user = userResult.rows[0];
  return <WebinarRoom webinarId={webinar.id} slug={webinar.slug} title={webinar.title} playbackId={webinar.mux_playback_id} presenterName={webinar.presenter_name} ctaLabel={webinar.cta_label} ctaUrl={webinar.cta_url} viewerName={user?.name || String(user?.email || "Attendee").split("@")[0]} sessionStartAt={sessionStartAt} sessionTimeZone={registration.rows[0]?.attendee_timezone || "UTC"} serverNow={Number(scheduleCount.rows[0]?.server_now)} durationSeconds={webinar.duration_seconds} timedEvents={eventsResult.rows} />;
}
