import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";
import { normalizeResourceUrl } from "@/lib/courseStudio";

async function canManageResources(): Promise<boolean> {
  if (await getAdminSession()) return true;
  const session = await getSession();
  return !!session && isConsoleOwner(session.email);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await canManageResources())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const resourceId = Number(id);
  if (!Number.isInteger(resourceId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { label, url, type, content, icon } = body;

  const normalizedUrl = url !== undefined ? (url ? normalizeResourceUrl(url) : null) : undefined;

  const result = await pool.query(
    `UPDATE lesson_resources SET
       label = COALESCE($1, label),
       url = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE url END,
       type = COALESCE($3, type),
       content = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE content END,
       icon = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE icon END
     WHERE id = $6
     RETURNING id, lesson_id, label, url, type, content, icon, position`,
    [
      label !== undefined ? String(label).slice(0, 200) : null,
      normalizedUrl !== undefined ? normalizedUrl : null,
      type ?? null,
      content !== undefined ? (content ? String(content).slice(0, 50000) : null) : null,
      icon !== undefined ? (icon ? String(icon).slice(0, 64) : null) : null,
      resourceId,
    ]
  );

  return NextResponse.json({ ok: true, resource: result.rows[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await canManageResources())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const resourceId = Number(id);
  if (!Number.isInteger(resourceId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  await pool.query("DELETE FROM lesson_resources WHERE id = $1", [resourceId]);
  return NextResponse.json({ ok: true });
}
