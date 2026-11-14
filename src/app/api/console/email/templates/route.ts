import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  canDeleteEmailTemplate,
  createSystemEmailTemplate,
  EmailTemplateCreateError,
  listEmailTemplates,
} from "@/lib/emailTemplates";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = (await listEmailTemplates()).map((template) => ({
    ...template,
    deletable: canDeleteEmailTemplate(template),
  }));
  return NextResponse.json({ templates });
}

/** Brings back a deleted system email. `key` must be one of
 * SYSTEM_EMAIL_DEFS's fixed keys -- an arbitrary new key would never be
 * read by anything, so this is a picker, not a free-text create. */
export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await req.json().catch(() => ({}));
  if (typeof key !== "string") return NextResponse.json({ error: "A key is required." }, { status: 400 });
  try {
    const template = await createSystemEmailTemplate(key);
    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof EmailTemplateCreateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
