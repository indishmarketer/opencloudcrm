import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { getFormById, getFormBySlug, updateForm, deleteForm } from "@/lib/forms";
import { normalizeFormDefinition, validateFormDefinition } from "@/lib/formsShape";
import { isUniqueViolation } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

async function resolveForm(rawId: string) {
  const numId = Number(rawId);
  return Number.isInteger(numId) && numId > 0 ? await getFormById(numId) : await getFormBySlug(rawId);
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "forms:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const form = await resolveForm(id);
  if (!form) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  return NextResponse.json({ form });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "forms:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await resolveForm(id);
  if (!existing) return NextResponse.json({ error: "Form not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) || {};
  const merged = {
    name: typeof body.name === "string" ? body.name : existing.name,
    slug: typeof body.slug === "string" ? body.slug : existing.slug,
    heading: typeof body.heading === "string" ? body.heading : existing.heading,
    introText: typeof body.introText === "string" ? body.introText : existing.introText,
    fields: body.fields !== undefined ? body.fields : existing.fields,
    elements: body.elements !== undefined ? body.elements : existing.elements,
    submitLabel: typeof body.submitLabel === "string" ? body.submitLabel : existing.submitLabel,
    successHeading: typeof body.successHeading === "string" ? body.successHeading : existing.successHeading,
    successText: typeof body.successText === "string" ? body.successText : existing.successText,
    submissionAction: typeof body.submissionAction === "string" ? body.submissionAction : existing.submissionAction,
    redirectUrl: typeof body.redirectUrl === "string" ? body.redirectUrl : existing.redirectUrl,
    notifyEmail: typeof body.notifyEmail === "string" ? body.notifyEmail : existing.notifyEmail,
    source: typeof body.source === "string" ? body.source : existing.source,
    // Freely toggleable on every form. It used to be pinned on for the
    // seeded Contact and Newsletter forms, which meant they could never be
    // used as plain forms, and -- because the Turnstile widget was hidden
    // whenever verification was on -- their submit could not succeed at all.
    verifyEmail: typeof body.verifyEmail === "boolean" ? body.verifyEmail : existing.verifyEmail,
    design: body.design !== undefined ? body.design : existing.design,
  };
  const normalized = normalizeFormDefinition(merged);
  const error = validateFormDefinition(normalized);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const ok = await updateForm(existing.id, normalized);
    if (!ok) return NextResponse.json({ error: "Form not found." }, { status: 404 });
    const updated = await getFormById(existing.id);
    return NextResponse.json({ form: updated });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A form with this share link slug already exists." }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "forms:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await resolveForm(id);
  if (!existing) return NextResponse.json({ error: "Form not found." }, { status: 404 });

  if (existing.isFixed) {
    return NextResponse.json(
      { error: "The Sign up / Log in form cannot be deleted -- account access depends on it." },
      { status: 403 },
    );
  }

  try {
    await deleteForm(existing.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not delete form." }, { status: 500 });
  }
}
