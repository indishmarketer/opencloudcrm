import { notFound, redirect } from "next/navigation";
import ConsoleWorkflowCanvasFrame from "@/components/ConsoleWorkflowCanvasFrame";
import LegacyEmailWorkflowCanvas from "@/components/LegacyEmailWorkflowCanvas";
import { pool } from "@/lib/db";
import { EMAIL_TRIGGERS } from "@/lib/emailAutomation";
import { emailAt } from "@/lib/liveSiteUrl";
import { listEmailTemplates } from "@/lib/emailTemplates";
import { listContentTemplates } from "@/lib/emailContentTemplates";
import { EMAIL_FLOW_VARIABLES, TEMPLATE_VARIABLES } from "@/lib/messageVariables";
import type { Edge, Node } from "@xyflow/react";

export const dynamic = "force-dynamic";

type CanvasNode = Node<{ kind: "trigger" | "wait" | "email"; label: string; config: Record<string, unknown> }, "legacyEmail">;

export default async function EmailWorkflowCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const migrated = await pool.query("SELECT visual_workflow_id FROM email_flows WHERE id=$1 AND archived_at IS NULL", [id]);
  if (migrated.rows[0]?.visual_workflow_id) redirect(`/console/workflows/${migrated.rows[0].visual_workflow_id}`);
  const [flowResult, stepResult, courses, segments, fixedTemplates, libraryTemplates] = await Promise.all([
    pool.query(`SELECT id, name, active, trigger_key, course_id, purpose, entry_segment_id, goal_type
      FROM email_flows WHERE id = $1 AND archived_at IS NULL`, [id]),
    pool.query(`SELECT id, position, delay_days, from_email, subject, body_html, condition_type, condition_step_id,
      action_type, review_template_key FROM email_flow_steps
      WHERE flow_id = $1 AND archived_at IS NULL ORDER BY position, id`, [id]),
    pool.query("SELECT id, title FROM courses ORDER BY title"),
    pool.query("SELECT id, name FROM contact_segments ORDER BY is_system DESC, name"),
    listEmailTemplates(),
    listContentTemplates(),
  ]);
  const flow = flowResult.rows[0];
  if (!flow) notFound();
  const triggerNodeId = "journey-trigger";
  const nodeIdByStepId = new Map<number, string>();
  for (const step of stepResult.rows) nodeIdByStepId.set(Number(step.id), `email-${step.id}`);
  const nodes: CanvasNode[] = [
    { id: triggerNodeId, type: "legacyEmail" as const, position: { x: 80, y: 220 }, data: { kind: "trigger" as const, label: EMAIL_TRIGGERS.find((trigger) => trigger.key === flow.trigger_key)?.label || flow.trigger_key, config: {} } },
    ...stepResult.rows.flatMap((step, index) => {
      const emailId = nodeIdByStepId.get(Number(step.id))!;
      const waitDays = Number(step.delay_days) || 0;
      const emailNode: CanvasNode = {
        id: emailId, type: "legacyEmail" as const, position: { x: 380 + (index * 2 + (waitDays > 0 ? 1 : 0)) * 180, y: 220 },
        data: { kind: "email" as const, label: step.subject || (step.action_type === "google_review_request" ? "Google review request" : "Email step"), config: {
          stepId: Number(step.id), fromEmail: step.from_email || emailAt("academy"),
          subject: step.subject || "", bodyHtml: step.body_html || "", conditionType: step.condition_type || "always",
          conditionStepNodeId: nodeIdByStepId.get(Number(step.condition_step_id)) || "",
          actionType: step.action_type === "google_review_request" ? "google_review_request" : "email",
          reviewTemplateKey: step.review_template_key || "google-review-request",
        } },
      };
      if (!waitDays) return [emailNode];
      const waitId = `wait-${step.id}`;
      const waitNode: CanvasNode = {
        id: waitId, type: "legacyEmail" as const, position: { x: 380 + index * 360, y: 220 },
        data: { kind: "wait" as const, label: `Wait ${waitDays} day${waitDays === 1 ? "" : "s"}`, config: { duration: waitDays, unit: "days", forStepId: Number(step.id) } },
      };
      return [waitNode, emailNode];
    }),
  ];
  const orderedIds = nodes.filter((node) => node.data.kind !== "trigger").map((node) => node.id);
  const path = [triggerNodeId, ...orderedIds];
  const edges: Edge[] = path.slice(0, -1).map((source, index) => ({ id: `journey-edge-${index}`, source, target: path[index + 1], animated: true, style: { stroke: "#525252", strokeWidth: 2 } }));
  const emailTemplates = [
    ...fixedTemplates.map((template) => ({ value: `fixed:${template.key}`, label: `Transactional · ${template.label}`, subject: template.subject, body: template.body_html, fromEmail: template.from_email })),
    ...libraryTemplates.map((template) => ({ value: `library:${template.id}`, label: `Email library · ${template.name}`, subject: template.subject, body: template.body_html })),
  ];

  const variables = EMAIL_FLOW_VARIABLES[flow.trigger_key] || TEMPLATE_VARIABLES;
  return <ConsoleWorkflowCanvasFrame><LegacyEmailWorkflowCanvas flow={flow} graph={{ nodes, edges }} triggers={[...EMAIL_TRIGGERS]} courses={courses.rows} segments={segments.rows} emailTemplates={emailTemplates} variables={variables} /></ConsoleWorkflowCanvasFrame>;
}
