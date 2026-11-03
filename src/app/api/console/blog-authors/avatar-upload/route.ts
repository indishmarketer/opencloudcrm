import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { uploadWebpImageToR2 } from "@/lib/r2Upload";

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No image was provided." }, { status: 400 });

  const uploaded = await uploadWebpImageToR2(file, "blog-authors");
  if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });
  return NextResponse.json({ url: uploaded.url });
}
