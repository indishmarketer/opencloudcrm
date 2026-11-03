import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

/** Permanently deletes every already-resolved alert, for the "Clear"
 * button on the Recently Resolved list. Separate from the daily cron's
 * 30-day retention sweep (course-nudge route): that one is silent
 * background cleanup, this is the owner explicitly saying "I'm done
 * looking at these, remove them now". Only ever touches resolved_at IS
 * NOT NULL rows -- an open alert is never deletable this way. */
export async function POST() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query("DELETE FROM system_alerts WHERE resolved_at IS NOT NULL");
  return NextResponse.json({ ok: true, cleared: result.rowCount ?? 0 });
}
