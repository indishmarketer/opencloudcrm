import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { listEmailTemplates } from "@/lib/emailTemplates";
import { unauthorized } from "@/lib/pagesApi";

/** Every fixed email this deployment sends, each bound to a specific
 * action in the app -- see GET /api/v1/email/:key and
 * src/lib/emailTemplates.ts. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "email:read");
  if (!auth.ok) return unauthorized();
  return NextResponse.json({ templates: await listEmailTemplates() });
}
