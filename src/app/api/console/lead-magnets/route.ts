import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only.").max(100),
  headline: z.string().trim().min(1).max(300),
  subheadline: z.string().trim().max(500).optional(),
  published: z.boolean().default(false),
}).strict();

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check those details." }, { status: 400 });
  const { title, slug, headline, subheadline, published } = parsed.data;

  const existing = await pool.query("SELECT id FROM lead_magnets WHERE slug = $1", [slug]);
  if (existing.rowCount) return NextResponse.json({ error: "That slug is already in use." }, { status: 409 });

  const result = await pool.query<{ id: number }>(
    `INSERT INTO lead_magnets (slug, title, headline, subheadline, published)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [slug, title, headline, subheadline || null, published],
  );
  return NextResponse.json({ ok: true, id: result.rows[0].id });
}
