import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { fetchSafeRemoteImage } from "@/lib/safeRemoteImage";
import { uploadDirectoryAsset } from "@/lib/logoFetch";

/**
 * Turns the sharing image already on a submitter's own page into their
 * first screenshot, so the common case needs no file picker at all. The URL
 * comes from `/api/directory/inspect` reading their og:image.
 *
 * Authenticated, unlike the inspect endpoint: this one writes a file to R2,
 * and an anonymous write endpoint is a storage bill waiting to happen. That
 * is also why the screenshot step sits after the account step in the form.
 *
 * `fetchSafeRemoteImage` does the SSRF guarding and refuses anything that
 * is not a real image under the size cap, so a page claiming an og:image
 * that points at an internal address gets nowhere.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(`directory-screenshot-url:${session.userId}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = typeof body.url === "string" ? body.url : "";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return NextResponse.json({ error: "That image link is not valid." }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "That image link is not valid." }, { status: 400 });
  }

  try {
    const { bytes } = await fetchSafeRemoteImage(parsed.toString());
    // Re-encoded rather than stored as sent: this decodes it (so a file
    // that is not really an image fails here, not on a visitor's page) and
    // strips whatever metadata the original carried.
    const png = await sharp(bytes).png().toBuffer();
    const url = await uploadDirectoryAsset(png, `directory/screenshots/${session.userId}`);
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json(
      { error: "We could not use that image. Upload one instead." },
      { status: 422 },
    );
  }
}
