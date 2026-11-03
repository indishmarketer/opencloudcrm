import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const flow = await pool.query(
    `SELECT f.id, f.name, f.trigger_key, f.active, f.course_id, f.purpose,
            f.entry_segment_id, f.goal_type, c.title AS course_title
     FROM email_flows f LEFT JOIN courses c ON c.id = f.course_id WHERE f.id = $1 AND f.archived_at IS NULL`,
    [Number(id)]
  );
  if (flow.rows.length === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const steps = await pool.query(
    `SELECT id, position, delay_days, from_email, subject, body_html, condition_type, condition_step_id
     FROM email_flow_steps WHERE flow_id = $1 AND archived_at IS NULL ORDER BY position, id`,
    [Number(id)]
  );

  return NextResponse.json({ flow: flow.rows[0], steps: steps.rows });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { name, active, purpose, entrySegmentId, goalType } = await req.json();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined) {
    values.push(String(name).slice(0, 200));
    fields.push(`name = $${values.length}`);
  }
  if (active !== undefined) {
    if (active) {
      const step = await pool.query("SELECT 1 FROM email_flow_steps WHERE flow_id = $1 AND archived_at IS NULL LIMIT 1", [Number(id)]);
      if (!step.rowCount) return NextResponse.json({ error: "Add at least one email before activating this flow." }, { status: 400 });
    }
    values.push(!!active);
    fields.push(`active = $${values.length}`);
  }
  if (purpose !== undefined) {
    if (!['service', 'marketing'].includes(purpose)) return NextResponse.json({ error: "Invalid purpose." }, { status: 400 });
    values.push(purpose); fields.push(`purpose = $${values.length}`);
  }
  if (entrySegmentId !== undefined) {
    const segmentId = entrySegmentId ? Number(entrySegmentId) : null;
    if (segmentId) {
      const segment = await pool.query("SELECT 1 FROM contact_segments WHERE id = $1", [segmentId]);
      if (!segment.rowCount) return NextResponse.json({ error: "Unknown entry segment." }, { status: 400 });
    }
    values.push(segmentId); fields.push(`entry_segment_id = $${values.length}`);
  }
  if (goalType !== undefined) {
    if (!['none', 'course_pro', 'course_completed', 'community_first_post'].includes(goalType)) {
      return NextResponse.json({ error: "Invalid exit goal." }, { status: 400 });
    }
    values.push(goalType); fields.push(`goal_type = $${values.length}`);
  }
  if (fields.length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  values.push(Number(id));
  const updated = await pool.query(`UPDATE email_flows SET ${fields.join(", ")} WHERE id = $${values.length} AND archived_at IS NULL RETURNING id`, values);
  if (!updated.rowCount) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const flowId = Number(id);
  if (!Number.isInteger(flowId) || flowId < 1) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const archived = await withTransaction(async (client) => {
    const flow = await client.query("UPDATE email_flows SET active = false, archived_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING id", [flowId]);
    if (!flow.rowCount) return false;
    await client.query("UPDATE email_flow_scheduled SET status = 'skipped', claimed_at = NULL, skipped_reason = 'Email journey deleted by an admin' WHERE step_id IN (SELECT id FROM email_flow_steps WHERE flow_id = $1) AND status = 'pending'", [flowId]);
    await client.query("UPDATE email_flow_runs SET status = 'cancelled', exit_reason = 'journey_deleted', finished_at = now() WHERE flow_id = $1 AND status = 'active'", [flowId]);
    return true;
  });
  if (!archived) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
