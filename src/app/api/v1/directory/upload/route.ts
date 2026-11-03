import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@/lib/apiTokens";
import { uploadImageToR2 } from "@/lib/r2Upload";
import { checkRateLimit } from "@/lib/rateLimit";

const SCOPE = "directory:write";

/** External upload endpoint -- lets an automation tool (n8n, Claude, or
 * anything else) send a logo/screenshot file with its API key and get
 * back an R2-hosted URL to pass as logo_url/screenshots in
 * POST /api/v1/directory/tools. Mirrors the admin console's own upload
 * path (src/app/api/console/directory/upload/route.ts) but authenticates
 * via the API key instead of an admin session. */
export async function POST(req: NextRequest) {
  const tokenId = await validateToken(req, SCOPE);
  if (!tokenId) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });

  if (!(await checkRateLimit(`directory-upload:${tokenId}`, 60, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many uploads this hour." }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const result = await uploadImageToR2(file, "directory");
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ url: result.url });
}
