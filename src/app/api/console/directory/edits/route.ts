import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

/** Edit requests waiting for review, with the live values to compare. */
export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query(
    `SELECT e.id, e.tool_id, e.changes, e.message, e.created_at, u.email AS user_email,
            t.name, t.tagline, t.description, t.category_id, t.pricing_type, t.website_url, t.screenshots
     FROM directory_tool_edits e
     JOIN directory_tools t ON t.id = e.tool_id
     JOIN users u ON u.id = e.user_id
     WHERE e.status = 'pending'
     ORDER BY e.created_at ASC`
  );
  return NextResponse.json({ edits: result.rows });
}
