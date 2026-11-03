import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getWhatsAppBusinessProfile, listWhatsAppPhoneNumbers } from "@/lib/whatsappTemplates";

/** Serves a number's current WhatsApp profile picture through our own
 * origin.
 *
 * Meta hands back a pps.whatsapp.net URL, which the site's
 * Content-Security-Policy does not allow as an image source -- and widening
 * img-src site-wide for one picture inside the console would be a bad
 * trade. Those URLs also carry an expiry, so proxying is more reliable than
 * hotlinking even without the policy. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const numbers = await listWhatsAppPhoneNumbers();
    if (!numbers.some((number) => number.id === id)) {
      return NextResponse.json({ error: "That number is not on this WhatsApp account." }, { status: 404 });
    }

    const url = (await getWhatsAppBusinessProfile(id)).profile_picture_url;
    if (!url) return NextResponse.json({ error: "No picture set." }, { status: 404 });

    const upstream = await fetch(url);
    if (!upstream.ok) return NextResponse.json({ error: "Could not fetch that picture." }, { status: 404 });

    return new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not reach WhatsApp." }, { status: 409 });
  }
}
