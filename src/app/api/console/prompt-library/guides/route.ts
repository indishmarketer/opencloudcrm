import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, isUniqueViolation } from "@/lib/db";
import { slugify, parseGuideItemsPayload } from "@/lib/promptLibrary";
import { replaceGuideItems } from "@/lib/guideItems";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `SELECT g.id, g.slug, g.title, g.description, g.video_url, g.body, g.status,
            COUNT(i.id)::int AS item_count, g.created_at, g.updated_at
     FROM prompt_guides g
     LEFT JOIN prompt_guide_items i ON i.guide_id = g.id
     GROUP BY g.id
     ORDER BY g.created_at DESC`
  );
  return NextResponse.json({ guides: result.rows });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, video_url, body: guideBody, status, items } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  const parsedItems = items === undefined ? [] : parseGuideItemsPayload(items);
  if (parsedItems === null) {
    return NextResponse.json({ error: "Every step needs a prompt or skill attached before saving." }, { status: 400 });
  }

  const slug = slugify(title);
  try {
    const result = await pool.query(
      `INSERT INTO prompt_guides (slug, title, description, video_url, body, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, slug`,
      [
        slug,
        title,
        description || null,
        video_url || null,
        guideBody || null,
        status === "published" ? "published" : "draft",
      ]
    );
    const guide = result.rows[0];
    if (parsedItems.length > 0) await replaceGuideItems(guide.id, parsedItems);
    return NextResponse.json({ guide });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A guide with that title already exists." }, { status: 400 });
    }
    throw err;
  }
}
