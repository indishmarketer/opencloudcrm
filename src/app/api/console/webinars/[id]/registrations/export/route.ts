import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

function csvField(value: unknown): string {
  const str = value == null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/** Exports every registration matching the console's current search (not
 * just the current page) as a CSV download -- these rows are the actual
 * lead list from this webinar, and previously had no export path at all. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId)) return NextResponse.json({ error: "Invalid webinar." }, { status: 400 });

  const url = new URL(req.url);
  const search = (url.searchParams.get("q") || "").trim().slice(0, 200);
  const sessionParam = url.searchParams.get("session") || "";
  const sessionFilter = sessionParam && !Number.isNaN(new Date(sessionParam).getTime()) ? new Date(sessionParam).toISOString() : "";

  const result = await pool.query(
    `SELECT wa.id, COALESCE(c.name, u.name) AS name, COALESCE(c.email, u.email) AS email,
            wa.attendee_timezone, wa.session_start_at, wa.registered_at, wa.watch_seconds, wa.completed_at, wa.left_at
     FROM webinar_access wa
     LEFT JOIN contacts c ON c.id = wa.contact_id
     LEFT JOIN users u ON u.id = wa.user_id
     WHERE wa.webinar_id = $1 AND ($2 = '' OR COALESCE(c.name, u.name) ILIKE '%' || $2 || '%' OR COALESCE(c.email, u.email) ILIKE '%' || $2 || '%')
       AND ($3 = '' OR wa.session_start_at = $3::timestamptz)
     ORDER BY wa.registered_at DESC LIMIT 20000`,
    [webinarId, search, sessionFilter],
  );

  const header = ["ID", "Name", "Email", "Timezone", "Broadcast start", "Registered at", "Watch seconds", "Completed", "Left early"];
  const lines = [header.map(csvField).join(",")];
  for (const row of result.rows) {
    lines.push([
      row.id,
      row.name || "",
      row.email || "",
      row.attendee_timezone || "",
      row.session_start_at ? new Date(row.session_start_at).toISOString() : "",
      new Date(row.registered_at).toISOString(),
      row.watch_seconds || 0,
      Boolean(row.completed_at),
      Boolean(row.left_at),
    ].map(csvField).join(","));
  }

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="webinar_${webinarId}_registrations_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
