import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { listEmailTemplates } from "@/lib/emailTemplates";
import { unauthorized } from "@/lib/pagesApi";

/** Every transactional email template this deployment sends (welcome
 * emails, receipts, reminders...). Each one is edited, never created or
 * deleted -- see GET /api/v1/email/:key and src/lib/emailTemplates.ts. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "email:read");
  if (!auth.ok) return unauthorized();
  return NextResponse.json({ templates: await listEmailTemplates() });
}
