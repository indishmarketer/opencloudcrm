import { NextRequest, NextResponse } from "next/server";
import { normalizeCountry } from "@/lib/countries";

/** The visitor's country from Cloudflare, for prefilling country pickers.
 * No database work and nothing stored. */
export async function GET(req: NextRequest) {
  return NextResponse.json(
    { country: normalizeCountry(req.headers.get("cf-ipcountry")) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
