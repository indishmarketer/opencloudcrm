import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { getR2ObjectMeta } from "@/lib/r2Upload";

/** Lazy per-item metadata fetch -- ListObjectsV2 can't return custom
 * object metadata (alt/title), only HeadObject can, and HEADing all 60
 * items on every page load would be 60 extra requests for data most of
 * them never show. Fetched only when a file's edit panel is opened. */
export async function GET(req: NextRequest) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = req.nextUrl.searchParams.get("key");
  if (!key || key.includes("..")) return NextResponse.json({ error: "Invalid file key." }, { status: 400 });

  const result = await getR2ObjectMeta(key);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
