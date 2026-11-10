import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { listForms, createForm, getFormById } from "@/lib/forms";
import { normalizeFormDefinition, validateFormDefinition } from "@/lib/formsShape";
import { isUniqueViolation } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "forms:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const forms = await listForms();
  return NextResponse.json({ forms });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, "forms:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const form = normalizeFormDefinition(body);
  const error = validateFormDefinition(form);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const id = await createForm(form);
    const created = await getFormById(id);
    return NextResponse.json({ form: created }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A form with this share link slug already exists." }, { status: 409 });
    }
    throw err;
  }
}
