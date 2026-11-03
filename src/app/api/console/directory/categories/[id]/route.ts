import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2Upload";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) return NextResponse.json({ error: "Invalid category." }, { status: 400 });

  const { name, description, sort_order } = await req.json();

  await pool.query(
    `UPDATE directory_categories SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      sort_order = COALESCE($3, sort_order)
     WHERE id = $4`,
    [name ?? null, description ?? null, Number.isInteger(sort_order) ? sort_order : null, categoryId]
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) return NextResponse.json({ error: "Invalid category." }, { status: 400 });

  // Deleting a category takes every tool in it with it -- the confirm
  // dialog on the frontend tells the admin the count before this runs.
  const tools = await pool.query(
    "DELETE FROM directory_tools WHERE category_id = $1 RETURNING logo_url, screenshots",
    [categoryId]
  );
  await pool.query("DELETE FROM directory_categories WHERE id = $1", [categoryId]);

  const assets = tools.rows.flatMap((t) => [t.logo_url, ...(t.screenshots || [])]).filter(Boolean);
  await Promise.all(assets.map((url: string) => deleteFromR2(url)));

  return NextResponse.json({ ok: true, deletedTools: tools.rowCount ?? 0 });
}
