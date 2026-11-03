import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { uploadImageToR2 } from "@/lib/r2Upload";

/** Logo / favicon / social image uploads for the Site identity tab. Uses
 * uploadImageToR2 (not the WebP-reencoding helper) so a PNG stays PNG --
 * transparency and a real .png favicon matter more here than byte size. */
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  const result = await uploadImageToR2(file, "site-identity");
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ url: result.url });
}
