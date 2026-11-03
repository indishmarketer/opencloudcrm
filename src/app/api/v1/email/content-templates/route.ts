import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { listContentTemplates, createContentTemplate } from "@/lib/emailContentTemplates";

/** The reusable Email Library (distinct from the fixed-trigger transactional
 * templates at /api/v1/email): content written once and picked from a
 * campaign, an automation step, or when emailing a contact directly. Unlike
 * transactional templates, these can be freely created and deleted. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "email:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ templates: await listContentTemplates() });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, "email:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const bodyHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : "";
  if (!name) return NextResponse.json({ error: "Give this template a name." }, { status: 400 });

  const actor = auth.via === "session" ? auth.email : "api";
  const template = await createContentTemplate({ name, subject, bodyHtml }, actor);
  return NextResponse.json({ template }, { status: 201 });
}
