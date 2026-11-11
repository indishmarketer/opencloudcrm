import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { deleteFormSubmission, getFormBySlug } from "@/lib/forms";

type Params = { params: Promise<{ id: string; submissionId: string }> };

async function resolveFormId(rawId: string): Promise<number | null> {
  const numId = Number(rawId);
  if (Number.isInteger(numId) && numId > 0) return numId;
  const form = await getFormBySlug(rawId);
  return form ? form.id : null;
}

/** Removes one recorded response. Scoped to the form in the path, so a
 * submission id from another form can't be deleted through it. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "forms:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, submissionId } = await params;
  const formId = await resolveFormId(id);
  if (!formId) return NextResponse.json({ error: "Form not found." }, { status: 404 });

  const numericSubmissionId = Number(submissionId);
  if (!Number.isInteger(numericSubmissionId) || numericSubmissionId < 1) {
    return NextResponse.json({ error: "Invalid submission id." }, { status: 400 });
  }

  const deleted = await deleteFormSubmission(formId, numericSubmissionId);
  if (!deleted) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
