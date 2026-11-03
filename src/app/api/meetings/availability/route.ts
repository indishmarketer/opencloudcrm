import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/rateLimit";
import { fetchAvailability } from "@/lib/calcom";
import { getMeetingTypeBySlug, isValidTimeZone } from "@/lib/meetingUtils";

const querySchema = z.object({ slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/).max(120), start: z.string().trim().min(10).max(64), end: z.string().trim().min(10).max(64), timezone: z.string().trim().min(1).max(100) });

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({ slug: req.nextUrl.searchParams.get("slug"), start: req.nextUrl.searchParams.get("start"), end: req.nextUrl.searchParams.get("end"), timezone: req.nextUrl.searchParams.get("timezone") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid availability query." }, { status: 400 });
  const { slug, start, end, timezone } = parsed.data;
  const startMs = Date.parse(start); const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs || endMs - startMs > 31 * 86400000) return NextResponse.json({ error: "Invalid or overly large date range." }, { status: 400 });
  if (!isValidTimeZone(timezone)) return NextResponse.json({ error: "Invalid timezone." }, { status: 400 });
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await consumeRateLimit(`meeting-availability:${ip}:${slug}`, 60, 10 * 60 * 1000))) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const meetingType = await getMeetingTypeBySlug(slug);
  if (!meetingType) return NextResponse.json({ error: "Meeting type not found." }, { status: 404 });
  try {
    const result = await fetchAvailability({ meetingType, start, end, timeZone: timezone });
    // Cal.com's /slots response groups by date ({"2026-08-30": [{start,end}], ...}) --
    // flatten that into the simple array shape the booking widget expects,
    // so the widget never has to know Cal.com's own response format.
    const grouped = (result.data || {}) as Record<string, { start: string; end: string }[]>;
    const slots = Object.values(grouped)
      .flat()
      .filter((slot) => slot && typeof slot.start === "string" && typeof slot.end === "string")
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return NextResponse.json({ status: "success", slots });
  } catch (error) {
    console.error("Cal.com availability request failed:", error);
    // Not 502/503/504 -- Cloudflare intercepts those and swaps in its own
    // HTML error page, which breaks JSON parsing client-side.
    return NextResponse.json({ error: "Availability is temporarily unavailable." }, { status: 500 });
  }
}
