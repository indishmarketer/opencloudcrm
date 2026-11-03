import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { canDeleteEmailTemplate, listEmailTemplates } from "@/lib/emailTemplates";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = (await listEmailTemplates()).map((template) => ({
    ...template,
    deletable: canDeleteEmailTemplate(template),
  }));
  return NextResponse.json({ templates });
}
