import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Every non-cancelled booking whose scheduled_start falls in the 7-day
 * window starting at `start` (inclusive) -- used by the console's Week
 * view, which needs a full week regardless of the Bookings list's own
 * pagination/filters. */
export async function GET(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const start = new URL(req.url).searchParams.get("start") || "";
  if (!DATE_RE.test(start)) return NextResponse.json({ error: "Invalid start date." }, { status: 400 });

  const result = await pool.query(
    `SELECT mb.id, mb.attendee_name, mb.attendee_email, mb.scheduled_start, mb.status, mt.name AS meeting_type_name
     FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id
     WHERE mb.scheduled_start >= $1::date AND mb.scheduled_start < $1::date + interval '7 days' AND mb.status != 'cancelled'
     ORDER BY mb.scheduled_start ASC LIMIT 500`,
    [start]
  );
  return NextResponse.json({ bookings: result.rows });
}
