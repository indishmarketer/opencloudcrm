import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { parsePositiveId } from "@/lib/courseStudio";

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = parsePositiveId(body?.id);
  const folderId = body?.folderId === null ? null : parsePositiveId(body?.folderId);
  const type = body?.type;
  if (!id || !["workflow", "email"].includes(type) || (body?.folderId !== null && !folderId)) {
    return NextResponse.json({ error: "Invalid workflow folder selection." }, { status: 400 });
  }
  if (folderId) {
    const folder = await pool.query("SELECT 1 FROM automation_workflow_folders WHERE id = $1", [folderId]);
    if (!folder.rowCount) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  }
  const table = type === "email" ? "email_flows" : "automation_workflows";
  const archivedFilter = type === "email" ? "archived_at IS NULL" : "archived_at IS NULL";
  const result = await pool.query(`UPDATE ${table} SET folder_id = $2 WHERE id = $1 AND ${archivedFilter} RETURNING id`, [id, folderId]);
  if (!result.rowCount) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
