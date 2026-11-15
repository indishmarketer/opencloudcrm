import { z } from "zod";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhookEventCatalogue";

export const WORKFLOW_NODE_KINDS = ["trigger", "condition", "email_condition", "wait", "email", "whatsapp", "google_review_request", "webhook", "course_access", "contact_update", "contact_unsubscribe", "contact_delete", "stop"] as const;
export type WorkflowNodeKind = (typeof WORKFLOW_NODE_KINDS)[number];

const workflowNodeSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string().optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  data: z.object({
    kind: z.enum(WORKFLOW_NODE_KINDS),
    label: z.string().max(120),
    config: z.record(z.string(), z.unknown()).default({}),
  }),
}).passthrough();

const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
  // React Flow exposes labels as ReactNode, so accept its full value shape
  // while preserving the rest of the edge contract.
  label: z.unknown().optional(),
}).passthrough();

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema).max(80),
  edges: z.array(workflowEdgeSchema).max(160),
}).superRefine((graph, context) => {
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.size !== graph.nodes.length) context.addIssue({ code: "custom", path: ["nodes"], message: "Node ids must be unique." });
  if (graph.nodes.filter((node) => node.data.kind === "trigger").length !== 1) {
    context.addIssue({ code: "custom", path: ["nodes"], message: "A workflow needs exactly one trigger node." });
  }
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      context.addIssue({ code: "custom", path: ["edges"], message: "Every connection must link two existing nodes." });
    }
    if (edge.source === edge.target) context.addIssue({ code: "custom", path: ["edges"], message: "A node cannot connect to itself." });
  }
});

export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
export type WorkflowNode = WorkflowGraph["nodes"][number];
export type WorkflowEdge = WorkflowGraph["edges"][number];

export const VERIFIED_CONTACT_SOURCES = [
  { value: "signup", label: "Email signup" },
  { value: "google", label: "Google" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "github", label: "GitHub" },
  { value: "newsletter", label: "Newsletter" },
  { value: "contact_form", label: "Contact form" },
  { value: "guide", label: "Free guide" },
  { value: "custom_form", label: "Verified custom form" },
] as const;

export const ACCOUNT_VERIFIED_SOURCES = ["signup", "google", "linkedin", "github"] as const;
export const VERIFIED_CONTACT_SOURCE_OPTIONS = [
  { value: "account", label: "Account signup" },
  ...VERIFIED_CONTACT_SOURCES.filter((source) => !ACCOUNT_VERIFIED_SOURCES.some((accountSource) => accountSource === source.value)),
];

/** This event is queued only inside the application: its one-time code/link
 * must never be published through the outbound webhook catalogue. */
export const VERIFICATION_REQUESTED_EVENT = {
  value: "contact.verification_requested",
  label: "Email verification requested",
  description: "An unverified person requests a code and magic link from signup, a form, newsletter, or guide. Configure one transactional Email step using data.code and data.verification_url. The link and code expire in 10 minutes.",
} as const;

export function isSupportedWorkflowEvent(key: string): boolean {
  return key === VERIFICATION_REQUESTED_EVENT.value || WEBHOOK_EVENT_TYPES.some((event) => event.key === key);
}

export function workflowEventLabel(key: string): string {
  return key === VERIFICATION_REQUESTED_EVENT.value
    ? VERIFICATION_REQUESTED_EVENT.label
    : WEBHOOK_EVENT_TYPES.find((event) => event.key === key)?.label || "Event trigger";
}

const SITE_WORKFLOW_EVENT_KEYS = [
  "contact.verified", "newsletter.unsubscribed", "course.enrolled", "course.upgraded",
  "course.revoked", "course.completed", "course.inactivity", "payment.succeeded", "payment.failed",
  "directory_tool.submitted", "directory_tool.reviewed",
] as const;

export const workflowTriggerOptions = [...SITE_WORKFLOW_EVENT_KEYS.map((key) => {
  const event = WEBHOOK_EVENT_TYPES.find((item) => item.key === key)!;
  return { value: event.key as string, label: event.label, description: event.description };
}), VERIFICATION_REQUESTED_EVENT];

export function workflowReadinessIssues(graph: WorkflowGraph): string[] {
  const issues: string[] = [];
  const trigger = graph.nodes.find((node) => node.data.kind === "trigger");
  if (!trigger || !graph.edges.some((edge) => edge.source === trigger.id)) issues.push("Connect the trigger to an action.");
  if (trigger?.data.config.triggerKey === VERIFICATION_REQUESTED_EVENT.value) {
    const emailNodes = graph.nodes.filter((node) => node.data.kind === "email");
    if (emailNodes.length !== 1) issues.push("Use exactly one Email step for verification requests.");
    if (graph.nodes.some((node) => !["trigger", "email", "stop"].includes(node.data.kind))) {
      issues.push("Verification requests must go directly to one Email step, with an optional End step.");
    }
    if (trigger.data.config.source || trigger.data.config.entrySegmentId || trigger.data.config.purpose || trigger.data.config.goalType) {
      issues.push("Verification requests must accept every source without an entry filter.");
    }
    if (emailNodes.length === 1 && !graph.edges.some((edge) => edge.source === trigger.id && edge.target === emailNodes[0].id)) {
      issues.push("Connect the verification trigger directly to the Email step.");
    }
    for (const node of emailNodes) {
      if (node.data.config.to !== "{{contact.email}}" || node.data.config.messageType !== "transactional") {
        issues.push("Send verification only to {{contact.email}} as Transactional email.");
      }
    }
  }
  if (["course.enrolled", "course.upgraded", "course.revoked", "course.completed", "course.inactivity", "payment.succeeded", "payment.failed"].includes(String(trigger?.data.config.triggerKey || ""))) {
    const courseId = String(trigger?.data.config.courseId || "");
    if (courseId && (!Number.isInteger(Number(courseId)) || Number(courseId) < 1)) issues.push("Choose a valid course for this trigger.");
  }
  if (trigger?.data.config.triggerKey === "contact.verified" && trigger.data.config.source &&
      trigger.data.config.source !== "account" && !VERIFIED_CONTACT_SOURCES.some((source) => source.value === trigger.data.config.source)) {
    issues.push("Choose a valid verified contact source.");
  }
  if (trigger?.data.config.triggerKey === "custom_form.submitted") {
    const formId = String(trigger?.data.config.formId || "");
    if (formId && (!Number.isInteger(Number(formId)) || Number(formId) < 1)) issues.push("Choose a valid form for this trigger.");
  }
  if (trigger?.data.config.triggerKey === "course.inactivity") {
    const inactiveDays = Number(trigger.data.config.inactiveDays ?? 3);
    if (!Number.isInteger(inactiveDays) || inactiveDays < 1 || inactiveDays > 365) issues.push("Set course inactivity from 1 to 365 days.");
  }
  if (!graph.nodes.some((node) => ["email", "whatsapp", "google_review_request", "webhook", "course_access", "contact_update", "contact_unsubscribe", "contact_delete"].includes(node.data.kind))) issues.push("Add an action before activating this workflow.");
  for (const node of graph.nodes) {
    const config = node.data.config;
    if (node.data.kind === "condition") {
      if (typeof config.field !== "string" || !config.field.trim()) issues.push(`Choose a field for condition "${node.data.label}".`);
      if (!graph.edges.some((edge) => edge.source === node.id && edge.sourceHandle === "true") ||
          !graph.edges.some((edge) => edge.source === node.id && edge.sourceHandle === "false")) {
        issues.push(`Connect both true and false exits from condition "${node.data.label}".`);
      }
    }
    if (node.data.kind === "email_condition" &&
        (!graph.edges.some((edge) => edge.source === node.id && edge.sourceHandle === "true") ||
         !graph.edges.some((edge) => edge.source === node.id && edge.sourceHandle === "false"))) {
      issues.push(`Connect both Yes and No exits from email check "${node.data.label}".`);
    }
    if (node.data.kind === "email_condition" && (!String(config.emailNodeId || "").trim() || !["opened", "not_opened", "clicked", "not_clicked"].includes(String(config.condition || "")))) {
      issues.push(`Configure the email engagement check for "${node.data.label}".`);
    }
    const emailTemplateReady = config.contentMode === "template" && typeof config.templateKey === "string" && !!config.templateKey.trim();
    if (node.data.kind === "email" && !emailTemplateReady && (typeof config.to !== "string" || !config.to.trim() || typeof config.subject !== "string" || !config.subject.trim() || typeof config.body !== "string" || !config.body.trim())) {
      issues.push(`Complete the email fields for "${node.data.label}".`);
    }
    if (node.data.kind === "whatsapp" && (typeof config.templateName !== "string" || !config.templateName.trim())) {
      issues.push(`Choose an approved WhatsApp template for "${node.data.label}".`);
    }
    if (node.data.kind === "webhook" && (typeof config.url !== "string" || !config.url.trim())) {
      issues.push(`Add a destination URL for "${node.data.label}".`);
    }
    if (node.data.kind === "course_access" && (!Number.isInteger(Number(config.courseId)) || Number(config.courseId) < 1 || !["free", "pro"].includes(String(config.tier)))) {
      issues.push(`Choose a course and access tier for "${node.data.label}".`);
    }
    if (node.data.kind === "contact_update" && (!["name", "phone"].includes(String(config.field)) || typeof config.value !== "string" || !config.value.trim())) {
      issues.push(`Choose a contact field and value for "${node.data.label}".`);
    }
    if (node.data.kind === "contact_delete" && config.confirm !== true) issues.push(`Confirm contact removal for "${node.data.label}".`);
    if (node.data.kind === "wait") {
      const duration = Number(config.duration);
      const multiplier = config.unit === "minutes" ? 1 : config.unit === "hours" ? 60 : config.unit === "days" ? 1440 : 0;
      if (!Number.isFinite(duration) || duration < 1 || duration * multiplier > 525600) issues.push(`Choose a wait duration from 1 minute up to 365 days for "${node.data.label}".`);
      if (config.anchorPath !== undefined && !["", "data.last_active_at", "occurred_at"].includes(String(config.anchorPath))) issues.push(`Choose a supported wait start date for "${node.data.label}".`);
    }
  }
  return issues;
}

export type WorkflowTestStep = { nodeId: string; label: string; status: "passed" | "skipped" | "failed"; message: string };

/** Walk the same connected graph as the dispatcher, but validate actions without
 * performing external side effects. Wait nodes are checked, not slept. */
export function simulateWorkflowGraph(graph: WorkflowGraph, payload: unknown): WorkflowTestStep[] {
  const issues = workflowReadinessIssues(graph);
  const issueForNode = (node: WorkflowNode) => issues.find((issue) => issue.includes(`"${node.data.label}"`));
  const trigger = graph.nodes.find((node) => node.data.kind === "trigger");
  if (!trigger) return [{ nodeId: "trigger", label: "Trigger", status: "failed", message: "A trigger node is required." }];
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = (id: string) => graph.edges.filter((edge) => edge.source === id);
  const results = new Map<string, WorkflowTestStep>();
  results.set(trigger.id, { nodeId: trigger.id, label: trigger.data.label, status: "passed", message: "Trigger is configured." });
  const queue = outgoing(trigger.id).map((edge) => ({ id: edge.target, handle: edge.sourceHandle || null }));
  const visited = new Set<string>([trigger.id]);
  while (queue.length && visited.size <= 100) {
    const current = queue.shift()!;
    const node = nodeById.get(current.id);
    if (!node || visited.has(node.id)) continue;
    visited.add(node.id);
    const issue = issueForNode(node);
    if (issue) {
      results.set(node.id, { nodeId: node.id, label: node.data.label, status: "failed", message: issue });
      continue;
    }
    if (node.data.kind === "condition" || node.data.kind === "email_condition") {
      const engagement = String(node.data.config.testEngagement || "opened");
      const emailCondition = String(node.data.config.condition || "opened");
      const passed = node.data.kind === "email_condition"
        ? emailCondition === "opened" ? ["opened", "clicked"].includes(engagement)
          : emailCondition === "not_opened" ? !["opened", "clicked"].includes(engagement)
          : emailCondition === "clicked" ? engagement === "clicked"
          : emailCondition === "not_clicked" ? engagement !== "clicked" : false
        : (() => {
      const actual = String(valueAtPath(payload, String(node.data.config.field || "")) ?? "").toLowerCase();
      const expected = String(node.data.config.value ?? "").toLowerCase();
      return node.data.config.operator === "missing" ? !actual
        : node.data.config.operator === "equals" ? actual === expected
        : node.data.config.operator === "not_equals" ? actual !== expected
        : node.data.config.operator === "contains" ? actual.includes(expected)
        : node.data.config.operator === "greater_than" ? Number(actual) > Number(expected)
        : node.data.config.operator === "less_than" ? Number(actual) < Number(expected)
        : !!actual;
          })();
      results.set(node.id, { nodeId: node.id, label: node.data.label, status: "passed", message: `Condition checked: ${passed ? "Yes" : "No"}.` });
      queue.push(...outgoing(node.id).filter((edge) => edge.sourceHandle === (passed ? "true" : "false")).map((edge) => ({ id: edge.target, handle: edge.sourceHandle || null })));
      continue;
    }
    if (node.data.kind === "wait") {
      results.set(node.id, { nodeId: node.id, label: node.data.label, status: "passed", message: `Wait duration is valid (${node.data.config.duration} ${node.data.config.unit}); test did not pause.` });
    } else if (node.data.kind === "stop") {
      results.set(node.id, { nodeId: node.id, label: node.data.label, status: "passed", message: "Workflow path ends here." });
      continue;
    } else {
      const actionName = node.data.kind === "email" ? "Email" : node.data.kind === "whatsapp" ? "WhatsApp" : node.data.kind === "google_review_request" ? "Google review request" : node.data.kind === "webhook" ? "Webhook" : node.data.kind === "course_access" ? "Course access" : node.data.kind === "contact_update" ? "Contact update" : node.data.kind === "contact_unsubscribe" ? "Contact unsubscribe" : "Contact removal";
      results.set(node.id, { nodeId: node.id, label: node.data.label, status: "passed", message: `${actionName} action is configured; no external action was performed.` });
    }
    queue.push(...outgoing(node.id).map((edge) => ({ id: edge.target, handle: edge.sourceHandle || null })));
  }
  if (queue.length) {
    const cycle = graph.nodes.find((node) => visited.has(node.id) && node.data.kind !== "trigger");
    if (cycle) results.set(cycle.id, { nodeId: cycle.id, label: cycle.data.label, status: "failed", message: "Workflow loop exceeds the 100-node test limit." });
  }
  for (const node of graph.nodes) {
    if (!results.has(node.id)) results.set(node.id, { nodeId: node.id, label: node.data.label, status: "skipped", message: "This node is not on the selected test path." });
  }
  const generalIssue = issues.find((issue) => !graph.nodes.some((node) => issue.includes(`"${node.data.label}"`)));
  if (generalIssue) results.set(trigger.id, { nodeId: trigger.id, label: trigger.data.label, status: "failed", message: generalIssue });
  return graph.nodes.map((node) => results.get(node.id)!);
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

export function defaultWorkflowGraph(triggerLabel: string): WorkflowGraph {
  return {
    nodes: [{ id: "trigger", type: "workflow", position: { x: 80, y: 180 }, data: { kind: "trigger", label: triggerLabel, config: {} } }],
    edges: [],
  };
}
