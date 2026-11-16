import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getPageSource, listPageSources, setPageSource } from "@/lib/pageSources";
import { cleanSourceLabel, MAX_SOURCE_WORDS, sourcePath } from "@/lib/pageSourcesShape";

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const path = req.nextUrl.searchParams.get("path");
  if (path) return NextResponse.json({ path: sourcePath(path), label: await getPageSource(path) });
  return NextResponse.json({ sources: await listPageSources() });
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const path = sourcePath(typeof body?.path === "string" ? body.path : "");
  if (!path) return NextResponse.json({ error: "Invalid page address." }, { status: 400 });
  const label = cleanSourceLabel(body?.label);
  if (label === null) return NextResponse.json({ error: `Keep the source to ${MAX_SOURCE_WORDS} words or fewer.` }, { status: 400 });
  await setPageSource(path, label);
  return NextResponse.json({ ok: true, path, label });
}
