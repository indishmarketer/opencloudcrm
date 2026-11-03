import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { getEmailTemplate, EmailTemplateUpdateError, updateEmailTemplate } from "@/lib/emailTemplates";
import { unauthorized } from "@/lib/pagesApi";

type Params = { params: Promise<{ key: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "email:read");
  if (!auth.ok) return unauthorized();
  const { key } = await params;
  try {
    return NextResponse.json({ template: await getEmailTemplate(key) });
  } catch {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
}

/** Edits an existing template's subject/body/sender/open-tracking. There is
 * no create or delete here: every key is sent by one specific trigger
 * elsewhere in the app, so a new key would never be sent and deleting an
 * existing one would break that trigger -- see
 * src/lib/emailTemplates.ts's updateEmailTemplate. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "email:write");
  if (!auth.ok) return unauthorized();
  const { key } = await params;
  const { subject, bodyHtml, fromEmail, trackOpens } = await req.json().catch(() => ({}));
  if (typeof subject !== "string" || typeof bodyHtml !== "string") {
    return NextResponse.json({ error: "subject and bodyHtml are required." }, { status: 400 });
  }
  try {
    await updateEmailTemplate(key, { subject, bodyHtml, fromEmail, trackOpens });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EmailTemplateUpdateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
