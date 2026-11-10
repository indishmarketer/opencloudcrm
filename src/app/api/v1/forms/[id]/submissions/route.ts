import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { getFormBySlug, listFormSubmissions } from "@/lib/forms";

type Params = { params: Promise<{ id: string }> };

async function resolveFormId(rawId: string): Promise<number | null> {
  const numId = Number(rawId);
  if (Number.isInteger(numId) && numId > 0) return numId;
  const form = await getFormBySlug(rawId);
  return form ? form.id : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "forms:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const formId = await resolveFormId(id);
  if (!formId) return NextResponse.json({ error: "Form not found." }, { status: 404 });

  const submissions = await listFormSubmissions(formId);
  return NextResponse.json({ submissions });
}
