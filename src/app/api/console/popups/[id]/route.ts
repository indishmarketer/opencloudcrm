import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { deletePopup, getPopup, updatePopup } from "@/lib/popups";
import { BlockValidationError } from "@/lib/pageBlocks";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const popup = await getPopup(Number((await params).id));
  if (!popup) return NextResponse.json({ error: "Popup not found." }, { status: 404 });
  return NextResponse.json({ popup });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const body = await req.json().catch(() => ({}));
  try {
    const popup = await updatePopup(id, body ?? {});
    if (!popup) return NextResponse.json({ error: "Popup not found." }, { status: 404 });
    return NextResponse.json({ popup });
  } catch (error) {
    // A bad element in the popup is the owner's mistake, not a server fault:
    // report it so the editor can show which one.
    if (error instanceof BlockValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ok = await deletePopup(Number((await params).id));
  if (!ok) return NextResponse.json({ error: "Popup not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
