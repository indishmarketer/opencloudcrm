import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

function csvField(value: unknown): string {
  const str = value == null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/** Exports every booking matching the console's current filters (not just
 * the current page) as a CSV download -- the console list itself is
 * paginated at 50 rows, this intentionally is not. */
export async function GET(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const requestedStatus = url.searchParams.get("status") || "";
  const status = ["confirmed", "cancelled", "rescheduled", "completed"].includes(requestedStatus) ? requestedStatus : "";
  const typeSlug = (url.searchParams.get("type") || "").trim().slice(0, 120);
  const fromValue = url.searchParams.get("from") || ""; const toValue = url.searchParams.get("to") || "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromValue) ? fromValue : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toValue) ? toValue : "";
  const search = (url.searchParams.get("q") || "").trim().slice(0, 200);

  const result = await pool.query(
    `SELECT mb.id, mb.attendee_name, mb.attendee_email, mb.attendee_timezone, mb.scheduled_start, mb.status, mb.actual_start_at, mb.actual_end_at, mb.host_no_show, mb.guest_no_show, mb.cancellation_reason, mt.name AS meeting_type_name
     FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id
     WHERE ($1 = '' OR mb.status = $1) AND ($2 = '' OR mt.slug = $2) AND ($3 = '' OR mb.scheduled_start >= $3::date) AND ($4 = '' OR mb.scheduled_start < ($4::date + interval '1 day')) AND ($5 = '' OR mb.attendee_name ILIKE '%' || $5 || '%' OR mb.attendee_email ILIKE '%' || $5 || '%')
     ORDER BY mb.scheduled_start DESC, mb.id DESC LIMIT 20000`,
    [status, typeSlug, from, to, search]
  );

  const header = ["ID", "Attendee name", "Attendee email", "Meeting type", "Scheduled start", "Timezone", "Status", "Host no-show", "Guest no-show", "Cancellation reason"];
  const lines = [header.map(csvField).join(",")];
  for (const row of result.rows) {
    lines.push([
      row.id,
      row.attendee_name,
      row.attendee_email,
      row.meeting_type_name,
      new Date(row.scheduled_start).toISOString(),
      row.attendee_timezone,
      row.status,
      row.host_no_show,
      row.guest_no_show,
      row.cancellation_reason || "",
    ].map(csvField).join(","));
  }

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="meetings_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
