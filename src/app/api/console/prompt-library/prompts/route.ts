import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, isUniqueViolation } from "@/lib/db";
import { slugify } from "@/lib/promptLibrary";
import { z } from "zod";

const PromptSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category_id: z.number().int(),
  description: z.string().trim().max(1000).optional().nullable(),
  prompt_text: z.string().trim().min(1).max(20000),
  status: z.string().optional(),
  show_in_library: z.boolean().optional(),
});

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `SELECT p.id, p.slug, p.title, p.description, p.prompt_text, p.status, p.show_in_library,
            p.category_id, c.name AS category_name, p.created_at, p.updated_at
     FROM prompts p
     JOIN prompt_categories c ON c.id = p.category_id
     ORDER BY p.created_at DESC`
  );
  return NextResponse.json({ prompts: result.rows });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PromptSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Title, category, and prompt text are required (title under 200 chars, prompt text under 20,000)." }, { status: 400 });
  }
  const { title, category_id, description, prompt_text, status, show_in_library } = parsed.data;

  const slug = slugify(title);
  try {
    const result = await pool.query(
      `INSERT INTO prompts (slug, title, category_id, description, prompt_text, status, show_in_library)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, slug`,
      [
        slug,
        title,
        category_id,
        description || null,
        prompt_text,
        status === "published" ? "published" : "draft",
        show_in_library ?? true,
      ]
    );
    return NextResponse.json({ prompt: result.rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A prompt with that title already exists." }, { status: 400 });
    }
    throw err;
  }
}
