import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { parsePositiveId } from "@/lib/courseStudio";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parsePositiveId((await params).id);
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!id) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  if (!name) return NextResponse.json({ error: "Enter a folder name." }, { status: 400 });
  try {
    const result = await pool.query("UPDATE automation_workflow_folders SET name = $2 WHERE id = $1 RETURNING id, name, created_at", [id, name]);
    if (!result.rowCount) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    return NextResponse.json({ folder: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return NextResponse.json({ error: "A folder with this name already exists." }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parsePositiveId((await params).id);
  if (!id) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  const result = await pool.query("DELETE FROM automation_workflow_folders WHERE id = $1 AND name <> 'Important' RETURNING id", [id]);
  if (!result.rowCount) return NextResponse.json({ error: "This folder cannot be deleted." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
