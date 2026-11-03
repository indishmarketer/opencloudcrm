import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";

async function canManageResources(): Promise<boolean> {
  if (await getAdminSession()) return true;
  const session = await getSession();
  return !!session && isConsoleOwner(session.email);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await canManageResources())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const resourceId = Number(id);
  const { label, url } = await req.json();
  if (!Number.isInteger(resourceId) || !label || !url) {
    return NextResponse.json({ error: "label and url are required." }, { status: 400 });
  }

  await pool.query("UPDATE lesson_resources SET label = $1, url = $2 WHERE id = $3", [
    String(label).slice(0, 200),
    String(url).slice(0, 1000),
    resourceId,
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await canManageResources())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const resourceId = Number(id);
  if (!Number.isInteger(resourceId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  await pool.query("DELETE FROM lesson_resources WHERE id = $1", [resourceId]);
  return NextResponse.json({ ok: true });
}
