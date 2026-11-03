import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { uploadWebpImageToR2 } from "@/lib/r2Upload";
import { GUIDE_BODY_IMAGE_PREFIX } from "@/lib/guideBody";

// Guide body images always convert to WebP on the way in (see
// uploadWebpImageToR2), and stale ones get cleaned up from R2 automatically
// when the guide's body is saved without them -- see the PATCH/DELETE
// handlers in guides/[id]/route.ts.
export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const result = await uploadWebpImageToR2(file, GUIDE_BODY_IMAGE_PREFIX);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ url: result.url });
}
