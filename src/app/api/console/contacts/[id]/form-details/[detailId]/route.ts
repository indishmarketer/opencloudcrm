import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { deleteContactFormDetail } from "@/lib/formSubmission";

/** Removes one form-gathered detail from a contact. Scoped to the contact in
 * the path, and deliberately independent of the submission it came from: the
 * owner can clear a detail off the CRM record while keeping the full response
 * in the form's own responses list, or the other way round. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; detailId: string }> },
) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, detailId } = await params;
  const contactId = Number(id);
  const numericDetailId = Number(detailId);
  if (!Number.isInteger(contactId) || !Number.isInteger(numericDetailId)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const deleted = await deleteContactFormDetail(contactId, numericDetailId);
  if (!deleted) return NextResponse.json({ error: "Detail not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
