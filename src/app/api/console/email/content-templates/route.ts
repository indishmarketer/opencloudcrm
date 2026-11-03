import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { listContentTemplates, createContentTemplate } from "@/lib/emailContentTemplates";

export async function GET() {
  const email = await getAdminSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ templates: await listContentTemplates() });
}

export async function POST(req: NextRequest) {
  const email = await getAdminSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const bodyHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : "";
  if (!name) return NextResponse.json({ error: "Give this template a name." }, { status: 400 });

  const template = await createContentTemplate({ name, subject, bodyHtml }, email);
  return NextResponse.json({ template }, { status: 201 });
}
