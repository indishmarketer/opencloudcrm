import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, isUniqueViolation } from "@/lib/db";
import { slugify } from "@/lib/promptLibrary";
import { z } from "zod";

const SkillSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category_id: z.number().int(),
  description: z.string().trim().max(1000).optional().nullable(),
  skill_markdown: z.string().trim().min(1).max(50000),
  status: z.string().optional(),
  show_in_library: z.boolean().optional(),
});

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `SELECT s.id, s.slug, s.title, s.description, s.skill_markdown, s.status, s.show_in_library,
            s.category_id, c.name AS category_name, s.created_at, s.updated_at
     FROM skills s
     JOIN prompt_categories c ON c.id = s.category_id
     ORDER BY s.created_at DESC`
  );
  return NextResponse.json({ skills: result.rows });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = SkillSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Title, category, and skill markdown are required (title under 200 chars, skill markdown under 50,000)." }, { status: 400 });
  }
  const { title, category_id, description, skill_markdown, status, show_in_library } = parsed.data;

  const slug = slugify(title);
  try {
    const result = await pool.query(
      `INSERT INTO skills (slug, title, category_id, description, skill_markdown, status, show_in_library)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, slug`,
      [
        slug,
        title,
        category_id,
        description || null,
        skill_markdown,
        status === "published" ? "published" : "draft",
        show_in_library ?? true,
      ]
    );
    return NextResponse.json({ skill: result.rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A skill with that title already exists." }, { status: 400 });
    }
    throw err;
  }
}
