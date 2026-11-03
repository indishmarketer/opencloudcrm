import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { z } from "zod";

const SkillPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category_id: z.number().int().optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  skill_markdown: z.string().trim().min(1).max(50000).optional(),
  status: z.string().optional(),
  show_in_library: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const skillId = Number(id);
  if (!Number.isInteger(skillId)) return NextResponse.json({ error: "Invalid skill." }, { status: 400 });

  const parsed = SkillPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Title under 200 chars, skill markdown under 50,000." }, { status: 400 });
  }
  const { title, category_id, description, skill_markdown, status, show_in_library } = parsed.data;

  await pool.query(
    `UPDATE skills SET
      title = COALESCE($1, title),
      category_id = COALESCE($2, category_id),
      description = COALESCE($3, description),
      skill_markdown = COALESCE($4, skill_markdown),
      status = COALESCE($5, status),
      show_in_library = COALESCE($6, show_in_library),
      updated_at = now()
     WHERE id = $7`,
    [
      title ?? null,
      Number.isInteger(category_id) ? category_id : null,
      description ?? null,
      skill_markdown ?? null,
      status === "published" || status === "draft" ? status : null,
      show_in_library ?? null,
      skillId,
    ]
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const skillId = Number(id);
  if (!Number.isInteger(skillId)) return NextResponse.json({ error: "Invalid skill." }, { status: 400 });

  await pool.query("DELETE FROM skills WHERE id = $1", [skillId]);
  return NextResponse.json({ ok: true });
}
