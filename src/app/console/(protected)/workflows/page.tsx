import ConsoleWorkflows from "@/components/ConsoleWorkflows";
import { listWorkflows, safeWorkflowRecord } from "@/lib/workflows";
import { workflowTriggerOptions } from "@/lib/workflowGraph";
import { SYSTEM_WORKFLOW_CATALOG } from "@/lib/systemWorkflowCatalog";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const [workflows, emailFlows, webhookDestinations, folders] = await Promise.all([
    listWorkflows(),
    pool.query(`SELECT f.id, f.name, f.trigger_key, f.active, f.course_id, f.folder_id, c.title AS course_title,
      COUNT(st.id) FILTER (WHERE st.archived_at IS NULL)::int AS step_count,
      COALESCE(BOOL_OR(st.delay_days > 0) FILTER (WHERE st.archived_at IS NULL), false) AS has_wait,
      COALESCE(BOOL_OR(st.action_type = 'email') FILTER (WHERE st.archived_at IS NULL), false) AS has_email_action,
      COALESCE(BOOL_OR(st.action_type = 'google_review_request') FILTER (WHERE st.archived_at IS NULL), false) AS has_review_request,
      COALESCE(ARRAY_AGG(COALESCE(NULLIF(st.subject, ''), CASE WHEN st.action_type = 'google_review_request' THEN 'Google review request' ELSE 'Email' END) ORDER BY st.position, st.id) FILTER (WHERE st.archived_at IS NULL), ARRAY[]::text[]) AS step_titles
      FROM email_flows f LEFT JOIN email_flow_steps st ON st.flow_id = f.id
      LEFT JOIN courses c ON c.id = f.course_id
      WHERE f.archived_at IS NULL AND f.visual_workflow_id IS NULL GROUP BY f.id, c.title ORDER BY f.created_at DESC`),
    pool.query("SELECT id, name, enabled, event_types FROM webhook_destinations ORDER BY created_at DESC"),
    pool.query("SELECT id, name FROM automation_workflow_folders ORDER BY lower(name), id"),
  ]);
  const triggers = Object.fromEntries(workflowTriggerOptions.map((item) => [item.value, item.label]));
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-2xl font-semibold sm:text-3xl">Workflows</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">Connect site events, conditions, email, WhatsApp, and external webhooks in one visual canvas. New workflows and run history are stored in this deployment&apos;s database.</p></div>
      </div>
      <div className="mt-7"><ConsoleWorkflows workflows={workflows.map(safeWorkflowRecord)} triggers={workflowTriggerOptions} emailFlows={emailFlows.rows} folders={folders.rows} systemFlows={SYSTEM_WORKFLOW_CATALOG} webhookDestinations={webhookDestinations.rows} /></div>
    </div>
  );
}
