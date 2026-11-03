import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { createWorkflow, listWorkflows, safeWorkflowRecord } from "@/lib/workflows";
import { workflowTriggerOptions } from "@/lib/workflowGraph";

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "workflows:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workflows = await listWorkflows();
  return NextResponse.json({ workflows: workflows.map(safeWorkflowRecord), triggers: workflowTriggerOptions });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, "workflows:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid workflow request." }, { status: 400 });
  }
  try {
    const created = await createWorkflow({
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      triggerType: body.triggerType === "webhook" ? "webhook" : "event",
      triggerKey: typeof body.triggerKey === "string" ? body.triggerKey : undefined,
    });
    return NextResponse.json({ workflow: safeWorkflowRecord(created.workflow), ...(created.webhookToken ? { webhookUrl: `/api/automation/inbound/${created.webhookToken}` } : {}) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create workflow." }, { status: 400 });
  }
}
