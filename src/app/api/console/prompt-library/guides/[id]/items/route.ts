import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const guideId = Number(id);
  if (!Number.isInteger(guideId)) return NextResponse.json({ error: "Invalid guide." }, { status: 400 });

  const result = await pool.query(
    `SELECT i.id, i.guide_id, i.position, i.item_type, i.prompt_id, i.skill_id,
            i.timestamp_label, i.instruction,
            COALESCE(p.title, s.title) AS item_title
     FROM prompt_guide_items i
     LEFT JOIN prompts p ON p.id = i.prompt_id
     LEFT JOIN skills s ON s.id = i.skill_id
     WHERE i.guide_id = $1
     ORDER BY i.position ASC`,
    [guideId]
  );
  return NextResponse.json({ items: result.rows });
}

// Replaces the guide's full ordered item list in one transaction -- simpler
// and less error-prone than incremental per-row add/remove/reorder endpoints
// for what's a short, hand-curated list per guide.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const guideId = Number(id);
  if (!Number.isInteger(guideId)) return NextResponse.json({ error: "Invalid guide." }, { status: 400 });

  const { items } = await req.json();
  if (!Array.isArray(items)) return NextResponse.json({ error: "Items must be an array." }, { status: 400 });

  for (const item of items) {
    if (item.item_type !== "prompt" && item.item_type !== "skill") {
      return NextResponse.json({ error: "Each item needs a type of prompt or skill." }, { status: 400 });
    }
    if (item.item_type === "prompt" && !Number.isInteger(item.prompt_id)) {
      return NextResponse.json({ error: "Each prompt item needs a prompt selected." }, { status: 400 });
    }
    if (item.item_type === "skill" && !Number.isInteger(item.skill_id)) {
      return NextResponse.json({ error: "Each skill item needs a skill selected." }, { status: 400 });
    }
  }

  await withTransaction(async (client) => {
    await client.query("DELETE FROM prompt_guide_items WHERE guide_id = $1", [guideId]);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await client.query(
        `INSERT INTO prompt_guide_items (guide_id, position, item_type, prompt_id, skill_id, timestamp_label, instruction)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          guideId,
          i,
          item.item_type,
          item.item_type === "prompt" ? item.prompt_id : null,
          item.item_type === "skill" ? item.skill_id : null,
          item.timestamp_label || null,
          item.instruction || null,
        ]
      );
    }
  });

  return NextResponse.json({ ok: true });
}
