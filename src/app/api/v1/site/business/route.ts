import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeRequest } from "@/lib/apiTokens";
import { readStoredBusinessProfile, saveBusinessProfile } from "@/lib/businessProfile";
import { normalizeBusinessProfile, validateBusinessProfile } from "@/lib/businessProfileShape";
import { unauthorized } from "@/lib/pagesApi";

/** Business details: owner, registration, contact, address, policy numbers. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "site:read");
  if (!auth.ok) return unauthorized();
  return NextResponse.json(await readStoredBusinessProfile());
}

/** Replaces the whole profile (fields left out become blank). */
export async function PUT(req: NextRequest) {
  const auth = await authorizeRequest(req, "site:write");
  if (!auth.ok) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const profile = normalizeBusinessProfile(body);
  const error = validateBusinessProfile(profile);
  if (error) return NextResponse.json({ error }, { status: 400 });
  await saveBusinessProfile(profile);
  revalidatePath("/", "layout");
  return NextResponse.json({ profile, source: "database" });
}
