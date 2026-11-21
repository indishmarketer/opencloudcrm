import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteFromR2, uploadGuideDocumentToR2 } from "@/lib/r2Upload";

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const rawTitle = String(form?.get("title") || "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });

  const title = (rawTitle || file.name.replace(/\.[^.]+$/, "")).slice(0, 200);
  if (!title) return NextResponse.json({ error: "Enter a document name." }, { status: 400 });

  const uploaded = await uploadGuideDocumentToR2(file);
  if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });

  try {
    const result = await pool.query<{ id: number; is_active: boolean }>(
      `INSERT INTO guide_documents (title, file_url, file_name, file_size, mime_type, is_active)
       VALUES ($1, $2, $3, $4, $5, NOT EXISTS (SELECT 1 FROM guide_documents WHERE is_active = true))
       RETURNING id, is_active`,
      [title, uploaded.url, uploaded.fileName, uploaded.size, uploaded.mimeType],
    );
    if (result.rows[0]?.is_active) {
      try { revalidatePath("/"); } catch (error) { console.error("Homepage revalidation failed:", error); }
    }
    return NextResponse.json({ ok: true, ...result.rows[0] });
  } catch (error) {
    await deleteFromR2(uploaded.url).catch(() => {});
    console.error("Guide document insert failed:", error);
    return NextResponse.json({ error: "The document was uploaded but could not be saved. Please try again." }, { status: 500 });
  }
}
