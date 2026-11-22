import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { parsePositiveId } from "@/lib/courseStudio";
import { uploadGuideDocumentToR2 } from "@/lib/r2Upload";

async function isAuthorized(): Promise<boolean> {
  if (await getAdminSession()) return true;
  const session = await getSession();
  return !!session && isConsoleOwner(session.email);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseId = parsePositiveId((await params).id);
  if (!courseId) return NextResponse.json({ error: "Invalid course." }, { status: 400 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Please select a file to upload." }, { status: 400 });
  }

  const uploaded = await uploadGuideDocumentToR2(file, `course-resources/${courseId}`);
  if ("error" in uploaded) {
    return NextResponse.json({ error: uploaded.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    url: uploaded.url,
    fileName: uploaded.fileName,
    size: uploaded.size,
    mimeType: uploaded.mimeType,
  });
}
