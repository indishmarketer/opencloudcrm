import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query("SELECT id, name, created_at FROM automation_workflow_folders ORDER BY lower(name), id");
  return NextResponse.json({ folders: result.rows });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Enter a folder name." }, { status: 400 });
  try {
    const result = await pool.query("INSERT INTO automation_workflow_folders (name) VALUES ($1) RETURNING id, name, created_at", [name]);
    return NextResponse.json({ folder: result.rows[0] }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return NextResponse.json({ error: "A folder with this name already exists." }, { status: 409 });
    throw error;
  }
}
