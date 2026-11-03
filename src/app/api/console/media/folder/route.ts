import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { createR2Folder } from "@/lib/r2Upload";

export async function POST(req: NextRequest) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { prefix?: string };
  if (!body.prefix || typeof body.prefix !== "string") {
    return NextResponse.json({ error: "Enter a folder name." }, { status: 400 });
  }
  const result = await createR2Folder(body.prefix);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
