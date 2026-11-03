import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { uploadImageToR2 } from "@/lib/r2Upload";
import { isBanned } from "@/lib/community";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isBanned(session.userId)) {
    return NextResponse.json({ error: "You've been restricted from posting in the community." }, { status: 403 });
  }

  if (!(await checkRateLimit(`post-image-upload:${session.userId}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const result = await uploadImageToR2(file, `community-posts/${session.userId}`);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ url: result.url });
}
