import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { readSiteIdentity, saveSiteIdentity } from "@/lib/siteIdentity";
import { normalizeSiteIdentity } from "@/lib/siteIdentityShape";

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ identity: await readSiteIdentity() });
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const identity = normalizeSiteIdentity(body);
  await saveSiteIdentity(identity);
  // The root layout's <title>, meta description, favicon and Organization
  // schema all read this, so every page needs re-rendering.
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, identity });
}
