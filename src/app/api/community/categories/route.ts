import { NextRequest, NextResponse } from "next/server";
import { getCommunityOwner } from "@/lib/communityAdminAuth";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!(await getCommunityOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { space, name, description } = await req.json();
  if (space !== "general" && space !== "pro") {
    return NextResponse.json({ error: "Invalid space." }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  if (!slug) return NextResponse.json({ error: "Name must contain letters or numbers." }, { status: 400 });

  const positionResult = await pool.query(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM community_categories WHERE space = $1",
    [space]
  );

  try {
    await pool.query(
      `INSERT INTO community_categories (space, name, slug, description, position) VALUES ($1, $2, $3, $4, $5)`,
      [space, String(name).slice(0, 100), slug, String(description || "").slice(0, 300) || null, positionResult.rows[0].next]
    );
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A category with that name already exists in this space." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await getCommunityOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) return NextResponse.json({ error: "Invalid category." }, { status: 400 });

  await pool.query("DELETE FROM community_categories WHERE id = $1", [categoryId]);
  return NextResponse.json({ ok: true });
}
