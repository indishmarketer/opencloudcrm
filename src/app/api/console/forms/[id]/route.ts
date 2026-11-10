import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getFormById, updateForm, deleteForm } from "@/lib/forms";
import { normalizeFormDefinition, validateFormDefinition } from "@/lib/formsShape";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const form = await getFormById(Number(id));
  if (!form) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ form });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const form = normalizeFormDefinition(body);
  const error = validateFormDefinition(form);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const ok = await updateForm(Number(id), form);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await deleteForm(Number(id));
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
