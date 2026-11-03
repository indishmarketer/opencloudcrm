import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { readStoredBusinessProfile, saveBusinessProfile } from "@/lib/businessProfile";
import { normalizeBusinessProfile, validateBusinessProfile } from "@/lib/businessProfileShape";

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await readStoredBusinessProfile());
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const profile = normalizeBusinessProfile(body);
  const error = validateBusinessProfile(profile);
  if (error) return NextResponse.json({ error }, { status: 400 });

  await saveBusinessProfile(profile);
  // Footer, contact blocks, legal pages and the Organization schema all
  // read this, so every page needs re-rendering.
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, profile });
}
