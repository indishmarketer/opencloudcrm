import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { ensureContact } from "@/lib/contacts";
import { withTransaction, pool } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rateLimit";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { upcomingWebinarSessions, type WebinarScheduleRule } from "@/lib/webinarSchedule";
import { sendWebinarEmail } from "@/lib/webinarEmails";

const registrationSchema = z.object({
  webinarId: z.coerce.number().int().positive(),
  slug: z.string().trim().min(1).max(200),
  attendeeTimezone: z.string().trim().min(1).max(100).optional(),
}).strict();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in or create your account to join." }, { status: 401 });

  if (!(await consumeRateLimit(`webinar-register:${session.userId}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const parsed = registrationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid webinar." }, { status: 400 });

  const [webinarResult, userResult] = await Promise.all([
    pool.query("SELECT id, slug, title, status, access_tier, duration_seconds FROM webinars WHERE id = $1 AND slug = $2 AND status = 'published' LIMIT 1", [parsed.data.webinarId, parsed.data.slug]),
    pool.query("SELECT id, name, email FROM users WHERE id = $1 AND email_verified_at IS NOT NULL LIMIT 1", [session.userId]),
  ]);
  const webinar = webinarResult.rows[0];
  const user = userResult.rows[0];
  if (!webinar) return NextResponse.json({ error: "This webinar is not available." }, { status: 404 });
  if (!user) return NextResponse.json({ error: "Verify your account before joining." }, { status: 403 });

  const scheduleResult = await pool.query<WebinarScheduleRule>("SELECT * FROM webinar_schedules WHERE webinar_id = $1 AND active = true", [webinar.id]);
  if (!scheduleResult.rows.length) {
    return NextResponse.json({ error: "This webinar does not have an active session scheduled yet." }, { status: 409 });
  }
  if (!webinar.duration_seconds) {
    return NextResponse.json({ error: "The webinar video is still being prepared." }, { status: 409 });
  }
  const sessionStartAt = upcomingWebinarSessions(scheduleResult.rows, new Date(), 1, 366, webinar.duration_seconds)[0];
  if (!sessionStartAt) return NextResponse.json({ error: "The next webinar broadcast is not available yet." }, { status: 409 });
  const attendeeTimezone = parsed.data.attendeeTimezone || scheduleResult.rows[0]?.timezone || "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: attendeeTimezone }).format(); }
  catch { return NextResponse.json({ error: "Invalid timezone." }, { status: 400 }); }

  if (webinar.access_tier === "pro" && !isConsoleOwner(session.email)) {
    const entitlement = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE user_id = $1 AND tier = 'pro') AS has_pro_course,
              EXISTS(SELECT 1 FROM community_memberships WHERE user_id = $1 AND status = 'active' AND (current_period_end IS NULL OR current_period_end > now())) AS has_membership`,
      [session.userId],
    );
    if (!entitlement.rows[0]?.has_pro_course && !entitlement.rows[0]?.has_membership) {
      return NextResponse.json({ error: "This webinar requires PRO access." }, { status: 403 });
    }
  }

  const email = String(user.email).trim().toLowerCase();
  const name = String(user.name || email.split("@")[0]);
  const registration = await withTransaction(async (client) => {
    const contactId = await ensureContact({ email, name, userId: session.userId }, client);
    const existing = await client.query(
      `SELECT id, session_start_at, attendee_timezone, registered_at, watch_seconds, completed_at, left_at
       FROM webinar_access
       WHERE webinar_id = $1 AND (user_id = $2 OR contact_id = $3) FOR UPDATE`,
      [webinar.id, session.userId, contactId],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      const previous = row.session_start_at ? new Date(row.session_start_at).toISOString() : null;
      const effectiveStart = sessionStartAt;
      const movingToNewOccurrence = previous !== null && previous !== effectiveStart;
      // webinar_access is one row per (webinar, user) -- re-registering
      // reassigns it to the new occurrence and zeroes attendance below.
      // Archive the outgoing occurrence's stats first (only when there's
      // real data worth keeping) so its historical numbers in the console
      // Analytics tab don't silently disappear.
      if (movingToNewOccurrence && (Number(row.watch_seconds) > 0 || row.completed_at)) {
        await client.query(
          `INSERT INTO webinar_attendance_archive (webinar_id, user_id, contact_id, session_start_at, attendee_timezone, registered_at, watch_seconds, completed_at, left_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [webinar.id, session.userId, contactId, row.session_start_at, row.attendee_timezone, row.registered_at, row.watch_seconds, row.completed_at, row.left_at],
        );
      }
      await client.query("UPDATE webinar_access SET user_id = $2, contact_id = COALESCE(contact_id, $3), session_start_at = $4, attendee_timezone = $5, left_at = NULL, completed_at = CASE WHEN session_start_at IS DISTINCT FROM $4 THEN NULL ELSE completed_at END, watch_seconds = CASE WHEN session_start_at IS DISTINCT FROM $4 THEN 0 ELSE watch_seconds END WHERE id = $1", [row.id, session.userId, contactId, effectiveStart, attendeeTimezone]);
      return { newlyRegistered: false, sessionChanged: previous !== effectiveStart, sessionStartAt: effectiveStart, accessId: Number(row.id) };
    }
    const effectiveStart = sessionStartAt;
    const inserted = await client.query(
      `INSERT INTO webinar_access (webinar_id, user_id, contact_id, session_start_at, attendee_timezone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (webinar_id, user_id) DO NOTHING
       RETURNING id`,
      [webinar.id, session.userId, contactId, effectiveStart, attendeeTimezone],
    );
    const accessId = inserted.rows[0]?.id
      ?? (await client.query("SELECT id FROM webinar_access WHERE webinar_id = $1 AND user_id = $2", [webinar.id, session.userId])).rows[0].id;
    return { newlyRegistered: true, sessionChanged: true, sessionStartAt: effectiveStart, accessId: Number(accessId) };
  });

  const roomUrl = `/webinars/${webinar.slug}/room`;
  if (registration.newlyRegistered || registration.sessionChanged) {
    try {
      await sendWebinarEmail("confirmation", {
        email, name, title: webinar.title, slug: webinar.slug,
        sessionStartAt: registration.sessionStartAt, attendeeTimezone,
        durationSeconds: webinar.duration_seconds,
        accessId: registration.accessId,
      });
    } catch (error) {
      console.error("Webinar registration email failed:", error);
    }
  }
  return NextResponse.json({ ok: true, roomUrl, newlyRegistered: registration.newlyRegistered, sessionStartAt: registration.sessionStartAt });
}
