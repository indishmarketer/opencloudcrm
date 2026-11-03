import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { uploadGuideFileToR2, deleteFromR2 } from "@/lib/r2Upload";
import { getLeadMagnetById } from "@/lib/leadMagnets";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const guide = await getLeadMagnetById(id);
  if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const result = await uploadGuideFileToR2(file, "lead-magnets");
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  await pool.query("UPDATE lead_magnets SET file_url = $2, updated_at = now() WHERE id = $1", [id, result.url]);
  if (guide.file_url) await deleteFromR2(guide.file_url).catch(() => {});

  return NextResponse.json({ ok: true, url: result.url });
}
