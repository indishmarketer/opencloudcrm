import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { purgeCloudflareCache } from "@/lib/seoActions";

export async function POST() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await purgeCloudflareCache();
  return NextResponse.json(result);
}
