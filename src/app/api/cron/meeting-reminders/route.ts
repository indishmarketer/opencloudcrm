import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { sendMeetingReminder } from "@/lib/meetingEmails";
import { dueMeetingReminderType } from "@/lib/meetingReminders";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET; const auth = req.headers.get("authorization"); const expected = secret ? `Bearer ${secret}` : null;
  return !!expected && !!auth && expected.length === auth.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(auth));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const due = await pool.query(`SELECT mb.id, mb.calcom_booking_uid, mb.attendee_email, mb.attendee_name, mb.attendee_timezone, mb.scheduled_start, mb.scheduled_end, mb.created_at, mt.name AS meeting_name FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id WHERE mb.status = 'confirmed' AND mb.scheduled_start > now() AND mb.scheduled_start <= now() + interval '24 hours' ORDER BY mb.scheduled_start ASC LIMIT 500`);
  let sent = 0; let skipped = 0; let failed = 0;
  for (const booking of due.rows) {
    const reminderType = dueMeetingReminderType(booking.scheduled_start, now, booking.created_at);
    if (!reminderType) { skipped++; continue; }
    const claim = await pool.query("INSERT INTO meeting_reminders (booking_id, reminder_type) VALUES ($1, $2) ON CONFLICT (booking_id, reminder_type) DO NOTHING RETURNING id", [booking.id, reminderType]);
    if (!claim.rows[0]) { skipped++; continue; }
    const ok = await sendMeetingReminder({ attendeeEmail: booking.attendee_email, attendeeName: booking.attendee_name, attendeeTimeZone: booking.attendee_timezone, meetingName: booking.meeting_name, scheduledStart: booking.scheduled_start, scheduledEnd: booking.scheduled_end, bookingId: Number(booking.id), calcomBookingUid: booking.calcom_booking_uid, reminderType });
    if (ok) sent++;
    else { await pool.query("DELETE FROM meeting_reminders WHERE id = $1", [claim.rows[0].id]); failed++; }
  }
  return NextResponse.json({ ok: true, considered: due.rows.length, sent, skipped, failed });
}
