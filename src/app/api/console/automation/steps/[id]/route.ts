import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { delayDays, fromEmail, subject, bodyHtml, conditionType, conditionStepId, actionType, reviewTemplateKey } = await req.json();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (delayDays !== undefined) {
    values.push(Math.max(0, Number(delayDays) || 0));
    fields.push(`delay_days = $${values.length}`);
  }
  if (fromEmail !== undefined) {
    values.push(String(fromEmail).slice(0, 200));
    fields.push(`from_email = $${values.length}`);
  }
  if (subject !== undefined) {
    values.push(String(subject).slice(0, 300));
    fields.push(`subject = $${values.length}`);
  }
  if (bodyHtml !== undefined) {
    values.push(String(bodyHtml));
    fields.push(`body_html = $${values.length}`);
  }
  if (actionType !== undefined) {
    if (!['email','google_review_request'].includes(actionType)) return NextResponse.json({ error: "Invalid action type." }, { status: 400 });
    values.push(actionType); fields.push(`action_type = $${values.length}`);
    values.push(actionType === 'google_review_request' ? (reviewTemplateKey === 'google-review-reminder' ? reviewTemplateKey : 'google-review-request') : null);
    fields.push(`review_template_key = $${values.length}`);
  }
  if (conditionType !== undefined) {
    const allowed = ['always', 'opened', 'not_opened', 'clicked', 'not_clicked'];
    if (!allowed.includes(conditionType)) return NextResponse.json({ error: "Invalid condition." }, { status: 400 });
    let referenceId: number | null = null;
    if (conditionType !== 'always') {
      referenceId = Number(conditionStepId);
      const validReference = await pool.query(
        `SELECT 1 FROM email_flow_steps current
         JOIN email_flow_steps previous ON previous.id = $2 AND previous.flow_id = current.flow_id
           AND previous.archived_at IS NULL
           AND (previous.position < current.position OR (previous.position = current.position AND previous.id < current.id))
         WHERE current.id = $1`, [Number(id), referenceId]);
      if (!validReference.rowCount) return NextResponse.json({ error: "Choose an earlier email for this condition." }, { status: 400 });
    }
    values.push(conditionType); fields.push(`condition_type = $${values.length}`);
    values.push(referenceId); fields.push(`condition_step_id = $${values.length}`);
  }
  if (fields.length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  values.push(Number(id));
  await pool.query(`UPDATE email_flow_steps SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await pool.query(
    "UPDATE email_flow_steps SET condition_type = 'always', condition_step_id = NULL WHERE condition_step_id = $1 AND archived_at IS NULL",
    [Number(id)],
  );
  await pool.query("UPDATE email_flow_scheduled SET status = 'skipped', claimed_at = NULL, skipped_reason = 'Journey step removed' WHERE step_id = $1 AND status = 'pending'", [Number(id)]);
  await pool.query("UPDATE email_flow_steps SET archived_at = now() WHERE id = $1 AND archived_at IS NULL", [Number(id)]);
  return NextResponse.json({ ok: true });
}
