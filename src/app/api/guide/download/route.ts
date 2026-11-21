import { NextRequest, NextResponse } from "next/server";
import { markGuideRequestOpened } from "@/lib/guideRequests";
import { getGuideDocumentById } from "@/lib/guideDocuments";
import { completeGuideVerification } from "@/lib/otpCompletion";
import { emitVerifiedContactEvent } from "@/lib/verifiedContactEvent";
import { SITE_URL } from "@/lib/siteMeta";

/** The tracked link in the guide email. Opening it does two things: it
 * sends the reader straight to the document, and it tells us the address
 * is real, which is what promotes them from "asked for the guide" to a
 * verified, subscribed contact.
 *
 * This replaces the old OTP step. A GET is deliberate here: the reader
 * should land on the PDF in one click, with nothing to confirm. The token
 * is not consumed, so the same link keeps working months later and the
 * same person can come back to it.
 *
 * The tradeoff is that a mailbox security scanner that pre-fetches links
 * (Defender Safe Links and similar) can register the open before the human
 * does. We accept that: the worst case is a lead marked verified slightly
 * early, where the old design's worst case was a real person losing the
 * guide because their code expired while they were busy.
 *
 * Redirects are built from SITE_URL, never req.url -- behind Coolify's
 * proxy req.url resolves to the container's internal bind address. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) return NextResponse.redirect(new URL("/?guide=missing", SITE_URL), { status: 303 });

  const opened = await markGuideRequestOpened(token);
  if (!opened) return NextResponse.redirect(new URL("/?guide=missing", SITE_URL), { status: 303 });

  const { request, alreadyOpened } = opened;

  // Re-opening the same link is just someone fetching their copy again. It
  // must still reach the file, but it must not replay the activity record,
  // the webhook or the consent update, so the one-time work is fenced off
  // behind the first open.
  if (alreadyOpened) {
    const guide = await getGuideDocumentById(request.guide_id);
    if (!guide) return NextResponse.redirect(new URL("/?guide=missing", SITE_URL), { status: 303 });
    return NextResponse.redirect(new URL(guide.file_url), { status: 303 });
  }

  const guide = await completeGuideVerification(
    request.email,
    {
      guideId: request.guide_id,
      name: request.name || "",
      phone: request.phone,
      country: request.country,
      token: request.token,
    },
    // The guide email is what they just clicked. Sending it again here
    // would mail them the same document on every open.
    { sendDeliveryEmail: false },
  );

  if (!guide) return NextResponse.redirect(new URL("/?guide=missing", SITE_URL), { status: 303 });

  await emitVerifiedContactEvent({ email: request.email, name: request.name || undefined, source: "guide" })
    .catch((error) => console.error("Guide verified contact event failed:", error));

  return NextResponse.redirect(new URL(guide.downloadUrl), { status: 303 });
}
