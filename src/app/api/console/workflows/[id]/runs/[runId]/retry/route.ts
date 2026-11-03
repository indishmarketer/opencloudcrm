import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { parsePositiveId } from "@/lib/courseStudio";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: workflowId, runId: rawRunId } = await params;
  const id = parsePositiveId(workflowId);
  const runId = parsePositiveId(rawRunId);
  if (!id || !runId) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  const result = await pool.query(
    `UPDATE automation_workflow_runs SET status = 'queued', error = null, finished_at = null, started_at = null, wait_until = NULL
     WHERE id = $1 AND workflow_id = $2 AND status = 'failed' RETURNING id`, [runId, id],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Only failed runs can be retried." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
