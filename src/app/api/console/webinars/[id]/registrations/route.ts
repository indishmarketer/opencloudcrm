import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

const MAX_IDS = 500;

/** Bulk/individual registration cleanup for the console Registrations tab --
 * either a set of row ids (checkbox selection) or every registration ever
 * assigned to one broadcast time (live + archived), for clearing out a
 * broadcast once it's over. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId)) return NextResponse.json({ error: "Invalid webinar." }, { status: 400 });

  const body = await req.json().catch(() => null);
  // webinar_access.id is bigint, so ids arriving from the client (sourced
  // from a JSON-serialized bigint column) are numeric strings, not numbers.
  const ids = Array.isArray(body?.ids)
    ? body.ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, MAX_IDS)
    : null;
  const sessionStartAt = typeof body?.sessionStartAt === "string" && !Number.isNaN(new Date(body.sessionStartAt).getTime())
    ? new Date(body.sessionStartAt).toISOString()
    : null;

  if (!ids?.length && !sessionStartAt) {
    return NextResponse.json({ error: "Nothing to delete." }, { status: 400 });
  }

  if (ids?.length) {
    const result = await pool.query(
      "DELETE FROM webinar_access WHERE webinar_id = $1 AND id = ANY($2::bigint[])",
      [webinarId, ids],
    );
    return NextResponse.json({ ok: true, deleted: result.rowCount || 0 });
  }

  const [accessResult, archiveResult] = await Promise.all([
    pool.query("DELETE FROM webinar_access WHERE webinar_id = $1 AND session_start_at = $2::timestamptz", [webinarId, sessionStartAt]),
    pool.query("DELETE FROM webinar_attendance_archive WHERE webinar_id = $1 AND session_start_at = $2::timestamptz", [webinarId, sessionStartAt]),
  ]);
  return NextResponse.json({ ok: true, deleted: (accessResult.rowCount || 0) + (archiveResult.rowCount || 0) });
}
