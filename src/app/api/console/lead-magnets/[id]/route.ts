import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2Upload";
import { getLeadMagnetById } from "@/lib/leadMagnets";

const UpdateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only.").max(100),
  headline: z.string().trim().min(1).max(300),
  subheadline: z.string().trim().max(500).optional(),
  published: z.boolean(),
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check those details." }, { status: 400 });
  const { title, slug, headline, subheadline, published } = parsed.data;

  const clash = await pool.query("SELECT id FROM lead_magnets WHERE slug = $1 AND id != $2", [slug, id]);
  if (clash.rowCount) return NextResponse.json({ error: "That slug is already in use." }, { status: 409 });

  const result = await pool.query(
    `UPDATE lead_magnets SET title = $2, slug = $3, headline = $4, subheadline = $5, published = $6, updated_at = now()
     WHERE id = $1`,
    [id, title, slug, headline, subheadline || null, published],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const guide = await getLeadMagnetById(id);
  if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await pool.query("DELETE FROM lead_magnets WHERE id = $1", [id]);

  // Best-effort, after the DB row is gone either way -- an orphaned R2
  // object is a smaller problem than a delete that half-failed.
  if (guide.cover_image_url) await deleteFromR2(guide.cover_image_url).catch(() => {});
  if (guide.file_url) await deleteFromR2(guide.file_url).catch(() => {});

  return NextResponse.json({ ok: true });
}
