import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { getContentTemplate, updateContentTemplate, deleteContentTemplate } from "@/lib/emailContentTemplates";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "email:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const template = await getContentTemplate(id);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "email:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const bodyHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : "";
  if (!name) return NextResponse.json({ error: "Give this template a name." }, { status: 400 });
  if (body.category !== undefined && body.category !== "marketing" && body.category !== "transactional") {
    return NextResponse.json({ error: "Choose marketing or transactional." }, { status: 400 });
  }
  if (body.blocks !== undefined && !Array.isArray(body.blocks) && body.blocks !== null) {
    return NextResponse.json({ error: "Blocks must be an array or null." }, { status: 400 });
  }

  const actor = auth.via === "session" ? auth.email : "api";
  const template = await updateContentTemplate(id, { name, subject, bodyHtml, category: body.category, blocks: body.blocks === undefined ? null : body.blocks }, actor);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  return NextResponse.json({ template });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "email:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const ok = await deleteContentTemplate(id);
  if (!ok) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
