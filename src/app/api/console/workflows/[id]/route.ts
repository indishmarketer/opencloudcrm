import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";
import { getWorkflow, safeWorkflowRecord, updateWorkflow } from "@/lib/workflows";
import { parsePositiveId } from "@/lib/courseStudio";
import { syncCourseInactivityFlows } from "@/lib/emailAutomation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parsePositiveId((await params).id);
  if (!id) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const [workflow, runs] = await Promise.all([
    getWorkflow(id),
    pool.query("SELECT id, status, trigger_payload, node_results, error, created_at, finished_at FROM automation_workflow_runs WHERE workflow_id = $1 ORDER BY id DESC LIMIT 30", [id]),
  ]);
  if (!workflow) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  return NextResponse.json({ workflow: safeWorkflowRecord(workflow), runs: runs.rows });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parsePositiveId((await params).id);
  if (!id) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid workflow update." }, { status: 400 });
  try {
    const workflow = await updateWorkflow(id, body as Parameters<typeof updateWorkflow>[1]);
    if (!workflow) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
    if (workflow.trigger_key === "course.inactivity") await syncCourseInactivityFlows();
    return NextResponse.json({ workflow: safeWorkflowRecord(workflow) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save workflow." }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parsePositiveId((await params).id);
  if (!id) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const archived = await withTransaction(async (client) => {
    const result = await client.query("UPDATE automation_workflows SET status = 'paused', archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING id", [id]);
    if (!result.rowCount) return false;
    await client.query("UPDATE automation_workflow_runs SET status = 'failed', error = 'Workflow deleted by an admin', finished_at = now() WHERE workflow_id = $1 AND status = 'queued'", [id]);
    return true;
  });
  if (!archived) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
