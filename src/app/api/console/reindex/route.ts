import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { submitUrlsForIndexing } from "@/lib/seoActions";
import { getAllPublicUrls } from "@/lib/seoUrls";

export async function POST() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const urls = await getAllPublicUrls();
  const result = await submitUrlsForIndexing(urls);
  return NextResponse.json(result);
}
