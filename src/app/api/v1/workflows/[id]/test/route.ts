import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { workflowGraphSchema } from "@/lib/workflowGraph";
import { getWorkflow } from "@/lib/workflows";
import { runWorkflowTest, WorkflowTestError } from "@/lib/workflowTest";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(req, "workflows:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const workflow = Number.isInteger(id) && id > 0 ? await getWorkflow(id) : null;
  if (!workflow) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = workflowGraphSchema.safeParse(body?.graph ?? workflow.graph);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid workflow graph." }, { status: 400 });
  try {
    const result = await runWorkflowTest({
      workflowId: id,
      graph: parsed.data,
      triggerKey: String(body?.triggerKey || "workflow.test"),
      recipient: {
        email: typeof body?.testEmail === "string" ? body.testEmail.trim() : "",
        phone: typeof body?.testPhone === "string" ? body.testPhone.trim() : "",
      },
    });
    return NextResponse.json(result, { status: result.error ? 422 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow test failed." }, { status: error instanceof WorkflowTestError ? error.status : 422 });
  }
}
