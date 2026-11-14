import crypto from "node:crypto";
import { pool } from "@/lib/db";
import { ensureContact } from "@/lib/contacts";
import { VERIFICATION_REQUESTED_EVENT } from "@/lib/workflowGraph";

/** Queue a private verification event for the one active workflow. One-time
 * credentials remain in workflow runs and never enter outbound webhooks. */
export async function queueVerificationWorkflow(input: {
  email: string;
  name?: string | null;
  userId?: number | null;
  source: string;
  code: string;
  verificationUrl: string;
  expiresAt: Date;
}): Promise<boolean> {
  const contactId = await ensureContact({ email: input.email, name: input.name, userId: input.userId });
  const eventId = crypto.randomUUID();
  const payload = {
    event_type: VERIFICATION_REQUESTED_EVENT.value,
    occurred_at: new Date().toISOString(),
    contact_id: contactId,
    data: {
      email: input.email,
      name: input.name || null,
      source: input.source,
      code: input.code,
      verification_url: input.verificationUrl,
      magic_link_url: input.verificationUrl,
      expires_minutes: 10,
      expires_at: input.expiresAt.toISOString(),
    },
  };
  const queued = await pool.query(
    `INSERT INTO automation_workflow_runs (workflow_id, dedupe_key, trigger_payload)
     SELECT id, $1, $2::jsonb FROM automation_workflows
     WHERE trigger_type = 'event' AND trigger_key = $3 AND status = 'active' AND archived_at IS NULL
     ON CONFLICT (workflow_id, dedupe_key) DO NOTHING RETURNING id`,
    [eventId, JSON.stringify(payload), VERIFICATION_REQUESTED_EVENT.value],
  );
  return (queued.rowCount ?? 0) > 0;
}
