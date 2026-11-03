import { NextRequest, NextResponse } from "next/server";
import { listPublishedTools } from "@/lib/directory";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tools = await listPublishedTools({
    category: searchParams.get("category") || undefined,
    subcategory: searchParams.get("subcategory") || undefined,
    pricing: searchParams.get("pricing") || undefined,
    q: searchParams.get("q") || undefined,
  });
  return NextResponse.json({ tools });
}
