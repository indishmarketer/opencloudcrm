import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { sendWebinarEmail } from "@/lib/webinarEmails";
import { dueWebinarEmailType } from "@/lib/webinarReminders";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const expected = secret ? `Bearer ${secret}` : null;
  return !!expected && !!auth && expected.length === auth.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(auth));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const due = await pool.query(
    `SELECT wa.id AS access_id, wa.session_start_at, wa.attendee_timezone,
            COALESCE(c.email, u.email) AS email, COALESCE(c.name, u.name, split_part(COALESCE(c.email, u.email), '@', 1)) AS name,
            w.title, w.slug, w.duration_seconds
     FROM webinar_access wa
     JOIN webinars w ON w.id = wa.webinar_id
     LEFT JOIN contacts c ON c.id = wa.contact_id
     LEFT JOIN users u ON u.id = wa.user_id
     WHERE wa.session_start_at IS NOT NULL AND w.duration_seconds IS NOT NULL
       AND COALESCE(c.email, u.email) IS NOT NULL
       AND wa.session_start_at >= now() - (w.duration_seconds * interval '1 second') - interval '1 hour'
       AND wa.session_start_at <= now() + interval '24 hours'
     ORDER BY wa.session_start_at
     LIMIT 500`,
  );
  let sent = 0, skipped = 0, failed = 0;
  for (const attendee of due.rows) {
    const reminderType = dueWebinarEmailType(attendee.session_start_at, Number(attendee.duration_seconds), now);
    if (!reminderType) { skipped++; continue; }
    const claim = await pool.query(
      `INSERT INTO webinar_reminders (access_id, session_start_at, reminder_type)
       VALUES ($1,$2,$3) ON CONFLICT (access_id,session_start_at,reminder_type) DO NOTHING RETURNING id`,
      [attendee.access_id, attendee.session_start_at, reminderType],
    );
    if (!claim.rows[0]) { skipped++; continue; }
    try {
      const ok = await sendWebinarEmail(reminderType, {
        email: attendee.email, name: attendee.name, title: attendee.title, slug: attendee.slug,
        sessionStartAt: attendee.session_start_at, attendeeTimezone: attendee.attendee_timezone || "UTC",
        durationSeconds: Number(attendee.duration_seconds),
        accessId: Number(attendee.access_id),
      });
      if (ok) sent++;
      else { await pool.query("DELETE FROM webinar_reminders WHERE id = $1", [claim.rows[0].id]); failed++; }
    } catch (error) {
      console.error("Webinar reminder email failed:", error);
      await pool.query("DELETE FROM webinar_reminders WHERE id = $1", [claim.rows[0].id]);
      failed++;
    }
  }
  return NextResponse.json({ ok: true, considered: due.rows.length, sent, skipped, failed });
}
