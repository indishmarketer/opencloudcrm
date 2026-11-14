import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { listEmailTemplates } from "@/lib/emailTemplates";
import { unauthorized } from "@/lib/pagesApi";

/** The fixed, non-deletable account & security emails this deployment
 * sends (verification, password reset, login links, account changes).
 * Each one is only ever edited, never created -- see GET /api/v1/email/:key
 * and src/lib/emailTemplates.ts. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "email:read");
  if (!auth.ok) return unauthorized();
  return NextResponse.json({ templates: await listEmailTemplates() });
}
