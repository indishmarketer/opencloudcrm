import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { EMAIL_TRIGGERS } from "@/lib/emailAutomation";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const flows = await pool.query(`
    SELECT f.id, f.name, f.trigger_key, f.active, f.created_at, f.course_id, f.purpose,
      f.entry_segment_id, f.goal_type, c.title AS course_title,
      COUNT(st.id)::int AS step_count
    FROM email_flows f
    LEFT JOIN email_flow_steps st ON st.flow_id = f.id
    LEFT JOIN courses c ON c.id = f.course_id
    WHERE f.archived_at IS NULL
    GROUP BY f.id, c.title
    ORDER BY f.created_at DESC
  `);
  return NextResponse.json({ flows: flows.rows });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, triggerKey, courseId, purpose, entrySegmentId } = await req.json();
  if (!name || !triggerKey) return NextResponse.json({ error: "name and triggerKey are required." }, { status: 400 });
  const trigger = EMAIL_TRIGGERS.find((t) => t.key === triggerKey);
  if (!trigger) return NextResponse.json({ error: "Unknown trigger." }, { status: 400 });
  if (trigger.courseScoped && !courseId) {
    return NextResponse.json({ error: "This trigger needs a specific course selected." }, { status: 400 });
  }
  const resolvedPurpose = purpose === "marketing" ? "marketing" : "service";
  const segmentId = entrySegmentId ? Number(entrySegmentId) : null;
  if (segmentId) {
    const segment = await pool.query("SELECT 1 FROM contact_segments WHERE id = $1", [segmentId]);
    if (!segment.rowCount) return NextResponse.json({ error: "Unknown entry segment." }, { status: 400 });
  }

  const result = await pool.query(
    `INSERT INTO email_flows (name, trigger_key, course_id, active, purpose, entry_segment_id)
     VALUES ($1, $2, $3, false, $4, $5) RETURNING id`,
    [String(name).slice(0, 200), triggerKey, trigger.courseScoped ? Number(courseId) : null, resolvedPurpose, segmentId]
  );
  return NextResponse.json({ id: result.rows[0].id });
}
