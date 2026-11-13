import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { createPopup, listPopups } from "@/lib/popups";
import { BlockValidationError } from "@/lib/pageBlocks";

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ popups: await listPopups() });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const popup = await createPopup(body ?? {});
    return NextResponse.json({ popup }, { status: 201 });
  } catch (error) {
    if (error instanceof BlockValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
