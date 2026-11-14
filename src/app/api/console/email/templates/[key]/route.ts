import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { deleteEmailTemplate, EmailTemplateDeleteError, EmailTemplateUpdateError, getRawEmailTemplate, updateEmailTemplate } from "@/lib/emailTemplates";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;
  const template = await getRawEmailTemplate(key);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  return NextResponse.json({ template });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;
  try {
    await deleteEmailTemplate(key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EmailTemplateDeleteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;
  const { subject, bodyHtml, fromEmail, trackOpens, blocks } = await req.json();
  if (typeof subject !== "string" || typeof bodyHtml !== "string") {
    return NextResponse.json({ error: "subject and bodyHtml are required." }, { status: 400 });
  }
  try {
    // Null selects Classic/HTML; an array selects Visual; omission keeps
    // the current stored layout.
    const blocksParam = blocks === null ? null : Array.isArray(blocks) ? blocks : undefined;
    await updateEmailTemplate(key, { subject, bodyHtml, fromEmail, trackOpens, blocks: blocksParam });
    const template = await getRawEmailTemplate(key);
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    if (error instanceof EmailTemplateUpdateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
