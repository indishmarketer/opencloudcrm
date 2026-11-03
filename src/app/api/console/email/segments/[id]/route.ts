import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { validateSegmentRules } from "@/lib/contactSegmentTypes";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as { name?: unknown; description?: unknown; rules?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 1000) : "";
  const validation = validateSegmentRules(body?.rules);
  if (!name || validation.error) {
    return NextResponse.json({ error: !name ? "Segment name is required." : validation.error }, { status: 400 });
  }
  const rules = validation.rules;
  const result = await pool.query(
    `UPDATE contact_segments SET name = $1, description = $2, rules = $3, updated_at = now()
     WHERE id = $4 AND is_system = false RETURNING id`,
    [name, description || null, JSON.stringify(rules), Number(id)],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Automatic segments cannot be edited." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await pool.query("DELETE FROM contact_segments WHERE id = $1 AND is_system = false", [Number(id)]);
  if (!result.rowCount) return NextResponse.json({ error: "System segments cannot be deleted." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
