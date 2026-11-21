import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getGuideDocumentById } from "@/lib/guideDocuments";
import { deleteFromR2 } from "@/lib/r2Upload";

function documentId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = documentId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (body?.active !== true) return NextResponse.json({ error: "Only active document selection is supported." }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query("SELECT id FROM guide_documents WHERE id = $1 FOR UPDATE", [id]);
    if (!exists.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    await client.query("UPDATE guide_documents SET is_active = false WHERE is_active = true");
    await client.query("UPDATE guide_documents SET is_active = true, updated_at = now() WHERE id = $1", [id]);
    await client.query("COMMIT");
    try { revalidatePath("/"); } catch (error) { console.error("Homepage revalidation failed:", error); }
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Guide document selection failed:", error);
    return NextResponse.json({ error: "Could not select that document." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = documentId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const document = await getGuideDocumentById(id);
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  try {
    await deleteFromR2(document.file_url, { strict: true });
  } catch (error) {
    console.error("Guide document storage deletion failed:", error);
    return NextResponse.json({ error: "The stored file could not be deleted, so the library record was kept." }, { status: 502 });
  }

  await pool.query("DELETE FROM guide_documents WHERE id = $1", [id]);
  if (document.is_active) {
    try { revalidatePath("/"); } catch (error) { console.error("Homepage revalidation failed:", error); }
  }
  return NextResponse.json({ ok: true });
}
