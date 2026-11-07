import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { readCrawlSettings, saveCrawlSettings } from "@/lib/siteCrawlSettings";
import { normalizeCrawlSettings } from "@/lib/siteCrawlSettingsShape";

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: await readCrawlSettings() });
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const settings = normalizeCrawlSettings(body);
  await saveCrawlSettings(settings);
  revalidatePath("/robots.txt");
  revalidatePath("/sitemap.xml");
  return NextResponse.json({ ok: true, settings });
}
