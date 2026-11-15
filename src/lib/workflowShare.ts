import { pool } from "@/lib/db";
import { getContentTemplate } from "@/lib/emailContentTemplates";
import { workflowGraphSchema, isSupportedWorkflowEvent, workflowEventLabel, type WorkflowGraph } from "@/lib/workflowGraph";
import { getWorkflow, type WorkflowRecord } from "@/lib/workflows";

/** A workflow as a portable file one OpenCloudCRM install can hand to
 * another. It carries the shape (steps, connections, conditions, email
 * wording with its {{merge fields}}) but none of this install's own values:
 * from-addresses, webhook URLs and secrets, and ids of courses, forms,
 * segments and saved templates are removed, since those mean nothing (or
 * the wrong thing) elsewhere. The importer fills them in from their own
 * system. Merge fields resolve against the importer's own data at send
 * time, so no contact or business data travels in the file. */
export const WORKFLOW_SHARE_FORMAT = "opencloudcrm-workflow";

export type SharedWorkflow = {
  format: typeof WORKFLOW_SHARE_FORMAT;
  version: 1;
  name: string;
  description: string;
  triggerType: "event" | "webhook";
  triggerKey: string | null;
  graph: WorkflowGraph;
  /** Steps the importer must finish before activating. */
  needsSetup: string[];
};

export async function exportWorkflow(id: number): Promise<SharedWorkflow | null> {
  const workflow = await getWorkflow(id);
  if (!workflow) return null;
  const needsSetup: string[] = [];
  const nodes = await Promise.all(workflow.graph.nodes.map(async (node) => {
    const config: Record<string, unknown> = { ...node.data.config };
    const label = node.data.label;
    switch (node.data.kind) {
      case "trigger":
        for (const key of ["courseId", "formId", "entrySegmentId"]) {
          if (config[key]) { delete config[key]; needsSetup.push(`Trigger: choose the ${key === "courseId" ? "course" : key === "formId" ? "form" : "entry segment"} again.`); }
        }
        break;
      case "email": {
        delete config.from;
        needsSetup.push(`"${label}": choose a From address.`);
        if (config.contentMode === "template" && config.templateKind === "library") {
          // Library template ids are per install: inline its content instead.
          const template = await getContentTemplate(Number(config.templateKey)).catch(() => null);
          if (template) Object.assign(config, { contentMode: "custom", subject: template.subject, body: template.body_html, templateKind: undefined, templateKey: undefined });
          else { Object.assign(config, { templateKey: "" }); needsSetup.push(`"${label}": pick an email template.`); }
        }
        break;
      }
      case "whatsapp":
        // Approved templates belong to each Meta account.
        Object.assign(config, { templateName: "", variables: [] });
        needsSetup.push(`"${label}": pick one of your approved WhatsApp templates.`);
        break;
      case "webhook":
        config.url = "";
        needsSetup.push(`"${label}": enter your destination URL.`);
        break;
      case "course_access":
        config.courseId = "";
        needsSetup.push(`"${label}": choose the course.`);
        break;
    }
    return { ...node, data: { ...node.data, config } };
  }));
  return {
    format: WORKFLOW_SHARE_FORMAT,
    version: 1,
    name: workflow.name,
    description: workflow.description,
    triggerType: workflow.trigger_type === "webhook" ? "webhook" : "event",
    triggerKey: workflow.trigger_type === "webhook" ? null : workflow.trigger_key,
    graph: { nodes, edges: workflow.graph.edges },
    needsSetup,
  };
}

/** Always lands as a draft: it can't run until the importer has reviewed it
 * and filled in their own values. A webhook-triggered one gets no endpoint
 * until they create one. */
export async function importWorkflow(file: unknown): Promise<WorkflowRecord> {
  const input = file as Partial<SharedWorkflow> | null;
  if (!input || input.format !== WORKFLOW_SHARE_FORMAT || input.version !== 1) throw new Error("This isn't an OpenCloudCRM workflow file.");
  const parsed = workflowGraphSchema.safeParse(input.graph);
  if (!parsed.success) throw new Error("The workflow file is damaged or from an incompatible version.");
  const triggerType = input.triggerType === "webhook" ? "webhook" : "event";
  const triggerKey = triggerType === "event" ? String(input.triggerKey || "") : null;
  if (triggerType === "event" && !isSupportedWorkflowEvent(triggerKey!)) throw new Error("This workflow uses a trigger this install doesn't support. Update OpenCloudCRM and try again.");
  const graph: WorkflowGraph = {
    ...parsed.data,
    nodes: parsed.data.nodes.map((node) => node.data.kind === "trigger"
      ? { ...node, data: { ...node.data, label: triggerType === "webhook" ? "Incoming webhook" : workflowEventLabel(triggerKey!), config: { ...node.data.config, triggerType, triggerKey } } }
      : node),
  };
  const name = `${String(input.name || "Imported workflow").slice(0, 140)} (imported)`;
  const setup = Array.isArray(input.needsSetup) ? input.needsSetup.filter((item): item is string => typeof item === "string").slice(0, 40) : [];
  const description = [String(input.description || ""), setup.length ? `Before activating:\n${setup.map((item) => `- ${item}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
  const result = await pool.query<WorkflowRecord>(
    `INSERT INTO automation_workflows (name, description, trigger_type, trigger_key, graph, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'draft')
     RETURNING id, name, description, status, trigger_type, trigger_key, webhook_token_hash, graph, folder_id, created_at, updated_at`,
    [name, description.slice(0, 2000), triggerType, triggerKey, JSON.stringify(graph)],
  );
  return result.rows[0];
}
