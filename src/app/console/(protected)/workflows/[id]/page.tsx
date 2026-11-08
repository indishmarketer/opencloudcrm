import { notFound } from "next/navigation";
import WorkflowCanvas from "@/components/WorkflowCanvas";
import { workflowTriggerOptions } from "@/lib/workflowGraph";
import { getWorkflow, safeWorkflowRecord } from "@/lib/workflows";
import { pool } from "@/lib/db";
import ConsoleWorkflowCanvasFrame from "@/components/ConsoleWorkflowCanvasFrame";
import { listEmailTemplates } from "@/lib/emailTemplates";
import { listContentTemplates } from "@/lib/emailContentTemplates";
import { listWhatsAppTemplates } from "@/lib/whatsappTemplates";
import { templateBody, templateVariables } from "@/lib/whatsappTemplateShape";
import { emailAt } from "@/lib/liveSiteUrl";
import { getAdminSessionEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [workflow, runs, emailTemplates, contentTemplates, rawWhatsAppTemplates, courses, segments, initialTestEmail] = await Promise.all([
    getWorkflow(id),
    pool.query(`SELECT id, status, error, created_at, finished_at, false AS legacy
      FROM automation_workflow_runs WHERE workflow_id = $1
      UNION ALL
      SELECT id, status, exit_reason AS error, started_at AS created_at, finished_at, true AS legacy
      FROM email_flow_runs WHERE flow_id=(SELECT legacy_email_flow_id FROM automation_workflows WHERE id=$1)
      ORDER BY created_at DESC LIMIT 30`, [id]),
    listEmailTemplates(),
    listContentTemplates(),
    listWhatsAppTemplates().catch(() => []),
    pool.query("SELECT id, title FROM courses ORDER BY title"),
    pool.query("SELECT id, name FROM contact_segments ORDER BY is_system DESC, name"),
    getAdminSessionEmail(),
  ]);
  if (!workflow) notFound();
  const emailOptions = [
    ...emailTemplates.map((template) => ({ value: `fixed:${template.key}`, label: `Transactional · ${template.label}`, kind: "fixed" as const, key: template.key, subject: template.subject, body: template.body_html, critical: template.critical })),
    ...contentTemplates.map((template) => ({ value: `library:${template.id}`, label: `Email Library · ${template.name}`, kind: "library" as const, key: String(template.id), subject: template.subject, body: template.body_html, critical: false })),
  ];
  const whatsappOptions = rawWhatsAppTemplates.filter((template) => template.status === "APPROVED" && template.category !== "AUTHENTICATION").map((template) => ({
    name: template.name, language: template.language, category: template.category, body: templateBody(template),
    variableCount: templateVariables(templateBody(template)).length,
  }));
  const fromAddresses = [
    { value: emailAt("me"), label: `Personal · ${emailAt("me")}` },
    { value: emailAt("support"), label: `Support · ${emailAt("support")}` },
    { value: emailAt("reach"), label: `Reach · ${emailAt("reach")}` },
    { value: emailAt("academy"), label: `Academy · ${emailAt("academy")}` },
  ];
  return <ConsoleWorkflowCanvasFrame><WorkflowCanvas workflow={safeWorkflowRecord(workflow)} triggers={workflowTriggerOptions} initialRuns={runs.rows} emailTemplates={emailOptions} whatsappTemplates={whatsappOptions} courses={courses.rows} segments={segments.rows} fromAddresses={fromAddresses} initialTestEmail={initialTestEmail || ""} /></ConsoleWorkflowCanvasFrame>;
}
