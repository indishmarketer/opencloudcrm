import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getEmailSettings, saveEmailSettings } from "@/lib/emailSettings";
import { normalizeEmailSettings, validateEmailSettings } from "@/lib/emailSettingsShape";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: await getEmailSettings() });
}

export async function PATCH(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const settings = normalizeEmailSettings(body);
  const error = validateEmailSettings(settings);
  if (error) return NextResponse.json({ error }, { status: 400 });

  await saveEmailSettings(settings);
  return NextResponse.json({ ok: true, settings });
}
