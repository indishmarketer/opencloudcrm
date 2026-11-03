import type { WorkflowGraph } from "@/lib/workflowGraph";
import { workflowReadinessIssues } from "@/lib/workflowGraph";
import { executeWorkflowTest } from "@/lib/workflows";
import { listWhatsAppTemplates } from "@/lib/whatsappTemplates";

export class WorkflowTestError extends Error {
  constructor(message: string, readonly status = 422) { super(message); }
}

export async function runWorkflowTest(input: {
  workflowId: number;
  graph: WorkflowGraph;
  triggerKey: string;
  recipient: { email: string; phone: string };
}) {
  if (input.graph.nodes.some((node) => node.data.kind === "email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient.email)) {
    throw new WorkflowTestError("Enter a valid test email address.", 400);
  }
  if (input.graph.nodes.some((node) => node.data.kind === "whatsapp") && !input.recipient.phone) {
    throw new WorkflowTestError("Enter a test phone number with its country code.", 400);
  }
  const issues = workflowReadinessIssues(input.graph);
  if (issues.length) throw new WorkflowTestError(issues[0]);
  const whatsappNodes = input.graph.nodes.filter((node) => node.data.kind === "whatsapp");
  if (whatsappNodes.length) {
    const templates = await listWhatsAppTemplates().catch(() => []);
    for (const node of whatsappNodes) {
      const name = String(node.data.config.templateName || "");
      const language = String(node.data.config.languageCode || "en");
      if (!templates.some((template) => template.name === name && template.language === language && template.status === "APPROVED")) {
        throw new WorkflowTestError(`Approved WhatsApp template "${name || "(not selected)"}" in ${language} is not available.`);
      }
    }
  }
  const raw = await executeWorkflowTest({ ...input, triggerKey: input.triggerKey || "workflow.test" });
  const failedNodeId = String(raw.__testFailedNode || "");
  const steps = input.graph.nodes.map((node) => {
    const result = raw[node.id] as Record<string, unknown> | undefined;
    const failed = node.id === failedNodeId || !!result?.error;
    const skipped = result?.skipped === true || result?.skippedWait === true || !result;
    const message = failed ? String(result?.error || "Action failed.")
      : !result ? "This step is on a branch the test trigger did not take."
      : result.skippedWait ? "Wait skipped for test."
      : result.skipped ? String(result.reason || "Skipped during test.")
      : node.data.kind === "condition" ? `Condition: ${result.passed ? "Yes" : "No"}.`
      : node.data.kind === "trigger" ? "Test trigger started."
      : node.data.kind === "stop" ? "Workflow path ended."
      : "Action completed.";
    return { nodeId: node.id, label: node.data.label, status: failed ? "failed" : skipped ? "skipped" : ["email", "whatsapp"].includes(node.data.kind) ? "sent" : "passed", message };
  });
  const failed = !!failedNodeId;
  return { steps, ...(failed ? { error: "Workflow test stopped at the failed step." } : {}) };
}
