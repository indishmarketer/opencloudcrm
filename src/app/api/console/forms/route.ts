import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { listForms, createForm } from "@/lib/forms";
import { normalizeFormDefinition, validateFormDefinition } from "@/lib/formsShape";
import { isUniqueViolation } from "@/lib/db";

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const forms = await listForms();
  return NextResponse.json({ forms });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const form = normalizeFormDefinition(body);
  const error = validateFormDefinition(form);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const id = await createForm(form);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A form with this share link slug already exists." }, { status: 409 });
    }
    throw err;
  }
}
