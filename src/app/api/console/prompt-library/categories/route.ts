import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, isUniqueViolation } from "@/lib/db";
import { slugify } from "@/lib/promptLibrary";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `SELECT c.id, c.slug, c.name, c.description, c.sort_order,
            COUNT(DISTINCT p.id)::int AS prompt_count,
            COUNT(DISTINCT s.id)::int AS skill_count
     FROM prompt_categories c
     LEFT JOIN prompts p ON p.category_id = c.id
     LEFT JOIN skills s ON s.category_id = c.id
     GROUP BY c.id
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  return NextResponse.json({ categories: result.rows });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, sort_order } = await req.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const slug = slugify(name);
  try {
    const result = await pool.query(
      `INSERT INTO prompt_categories (slug, name, description, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING id, slug, name, description, sort_order`,
      [slug, name, description || null, Number.isInteger(sort_order) ? sort_order : 0]
    );
    return NextResponse.json({ category: result.rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A category with that name already exists." }, { status: 400 });
    }
    throw err;
  }
}
