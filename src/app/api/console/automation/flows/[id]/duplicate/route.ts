import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const flow = await pool.query("SELECT name, trigger_key, course_id, purpose, entry_segment_id, goal_type FROM email_flows WHERE id = $1", [
    Number(id),
  ]);
  if (flow.rows.length === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const original = flow.rows[0];

  // New flow always starts inactive, same rule as any freshly created
  // flow -- a duplicate shouldn't go live before it's reviewed either.
  const newFlow = await pool.query(
    `INSERT INTO email_flows (name, trigger_key, course_id, active, purpose, entry_segment_id, goal_type)
     VALUES ($1, $2, $3, false, $4, $5, $6) RETURNING id`,
    [`${original.name} (copy)`.slice(0, 200), original.trigger_key, original.course_id,
      original.purpose, original.entry_segment_id, original.goal_type]
  );
  const newFlowId = newFlow.rows[0].id;

  const steps = await pool.query(
    `SELECT id, position, delay_days, from_email, subject, body_html, condition_type, condition_step_id
     FROM email_flow_steps WHERE flow_id = $1 AND archived_at IS NULL ORDER BY position, id`,
    [Number(id)]
  );
  const copiedIds = new Map<number, number>();
  for (const step of steps.rows) {
    const copied = await pool.query(
      `INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html, condition_type, condition_step_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [newFlowId, step.position, step.delay_days, step.from_email, step.subject, step.body_html,
        step.condition_type, step.condition_step_id ? copiedIds.get(Number(step.condition_step_id)) || null : null]
    );
    copiedIds.set(Number(step.id), Number(copied.rows[0].id));
  }

  return NextResponse.json({ id: newFlowId });
}
