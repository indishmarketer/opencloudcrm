import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2Upload";
import { extractGuideBodyImageUrls } from "@/lib/guideBody";
import { parseGuideItemsPayload } from "@/lib/promptLibrary";
import { replaceGuideItems } from "@/lib/guideItems";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const guideId = Number(id);
  if (!Number.isInteger(guideId)) return NextResponse.json({ error: "Invalid guide." }, { status: 400 });

  const body = await req.json();
  const { title, description, video_url, body: guideBody, status, items } = body;

  const parsedItems = items === undefined ? null : parseGuideItemsPayload(items);
  if (items !== undefined && parsedItems === null) {
    return NextResponse.json({ error: "Every step needs a prompt or skill attached before saving." }, { status: 400 });
  }

  // The admin's rich editor may have dropped images the guide previously
  // had -- those images live only on R2, so diff old vs new body HTML here
  // and clean up whatever's no longer referenced, best-effort.
  let removedImageUrls: string[] = [];
  if (typeof guideBody === "string") {
    const existing = await pool.query(`SELECT body FROM prompt_guides WHERE id = $1`, [guideId]);
    const oldUrls = new Set(extractGuideBodyImageUrls(existing.rows[0]?.body));
    const newUrls = new Set(extractGuideBodyImageUrls(guideBody));
    removedImageUrls = [...oldUrls].filter((url) => !newUrls.has(url));
  }

  await pool.query(
    `UPDATE prompt_guides SET
      title = COALESCE($1, title),
      description = COALESCE($2, description),
      video_url = COALESCE($3, video_url),
      body = COALESCE($4, body),
      status = COALESCE($5, status),
      updated_at = now()
     WHERE id = $6`,
    [
      title ?? null,
      description ?? null,
      video_url ?? null,
      guideBody ?? null,
      status === "published" || status === "draft" ? status : null,
      guideId,
    ]
  );

  if (parsedItems !== null) await replaceGuideItems(guideId, parsedItems);
  await Promise.all(removedImageUrls.map((url) => deleteFromR2(url)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const guideId = Number(id);
  if (!Number.isInteger(guideId)) return NextResponse.json({ error: "Invalid guide." }, { status: 400 });

  const existing = await pool.query(`SELECT body FROM prompt_guides WHERE id = $1`, [guideId]);
  const imageUrls = extractGuideBodyImageUrls(existing.rows[0]?.body);

  await pool.query("DELETE FROM prompt_guides WHERE id = $1", [guideId]);
  await Promise.all(imageUrls.map((url) => deleteFromR2(url)));

  return NextResponse.json({ ok: true });
}
