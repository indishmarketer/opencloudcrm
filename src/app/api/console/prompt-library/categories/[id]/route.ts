import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) return NextResponse.json({ error: "Invalid category." }, { status: 400 });

  const { name, description, sort_order } = await req.json();

  await pool.query(
    `UPDATE prompt_categories SET
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

  // Deleting a category takes every prompt and skill in it with it -- the
  // confirm dialog on the frontend tells the admin the counts before this runs.
  const prompts = await pool.query("DELETE FROM prompts WHERE category_id = $1 RETURNING id", [categoryId]);
  const skills = await pool.query("DELETE FROM skills WHERE category_id = $1 RETURNING id", [categoryId]);
  await pool.query("DELETE FROM prompt_categories WHERE id = $1", [categoryId]);

  return NextResponse.json({ ok: true, deletedPrompts: prompts.rowCount ?? 0, deletedSkills: skills.rowCount ?? 0 });
}
