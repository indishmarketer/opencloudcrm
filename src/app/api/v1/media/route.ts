import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { listR2Objects, uploadMediaLibraryImage } from "@/lib/r2Upload";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, rasterizeSvg, rejectUnsafeSvg } from "@/lib/imagePolicy";
import { fetchSafeRemoteImage } from "@/lib/safeRemoteImage";
import { unauthorized } from "@/lib/pagesApi";

/** The media library, over the API/MCP surface: the same Cloudflare R2
 * bucket the console's /console/media page browses and uploads to (see
 * src/app/api/console/media/route.ts), so an image an MCP client uploads
 * here shows up there too, and vice versa -- one media library either way. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "media:read");
  if (!auth.ok) return unauthorized();

  const prefix = req.nextUrl.searchParams.get("prefix") || undefined;
  const continuationToken = req.nextUrl.searchParams.get("continuationToken") || undefined;
  const recursive = req.nextUrl.searchParams.get("recursive") === "1";
  const result = await listR2Objects({ prefix, continuationToken, recursive });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json(result);
}

// Base64 inflates the byte count by ~33%, plus the data: URI prefix and
// JSON envelope -- generous but still bounded headroom over the real
// MAX_IMAGE_SIZE cap enforced again (on the decoded bytes) below.
const MAX_BASE64_LENGTH = Math.ceil((MAX_IMAGE_SIZE * 4) / 3) + 10_000;

function decodeDataPayload(raw: string): { bytes: Buffer; mimeFromDataUri: string | null } | null {
  const dataUriMatch = raw.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]*)$/i);
  const base64 = dataUriMatch ? dataUriMatch[2] : raw;
  try {
    return { bytes: Buffer.from(base64, "base64"), mimeFromDataUri: dataUriMatch?.[1] ?? null };
  } catch {
    return null;
  }
}

/** Uploads an image into the Media Library and hands back its public URL
 * to embed in a page's image/ogImage field, a blog post's feature image,
 * and so on. Two ways to say where the bytes are:
 *
 * - `sourceUrl`: a public http(s) URL this server downloads itself. This
 *   is the one an MCP/LLM client should reach for, and it is why it
 *   exists. With `dataBase64` the bytes have to travel *through* the
 *   model as base64 text in the tool call's arguments, and base64 of even
 *   a modest 300KB PNG is ~400,000 characters -- far past what a client
 *   will carry in one tool call, and past what a model can emit at all.
 *   The client then reports it as a size problem, so the obvious response
 *   is to shrink the image and try again, which never helps, because the
 *   limit being hit is the message/output budget rather than this route's
 *   5MB one. A URL is a few dozen characters no matter how big the image
 *   is, and the download happens server-side at full speed.
 * - `svg`: SVG markup this server rasterizes itself. The other half of
 *   what a hosted chat client can actually do unaided: SVG is text, so a
 *   few KB of markup is well inside what a model can emit, where the same
 *   picture as base64 pixels is not. This is the "draw it programmatically
 *   and upload it" path -- charts, diagrams, framed layouts, title cards --
 *   and it needs no image-generation provider at all.
 * - `dataBase64`: the raw bytes inline. Right for a small image, or for a
 *   client that genuinely holds bytes with nowhere to host them.
 *
 * sourceUrl goes through fetchSafeRemoteImage, the same SSRF-hardened
 * fetcher the rest of the app uses for remote images: public unicast IPs
 * only (re-checked after DNS and pinned for the connection, so a name
 * that resolves to a private address can't be swapped in mid-flight),
 * https/http only, no credentials in the URL, capped redirects, hard byte
 * ceiling while streaming. */
export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, "media:write");
  if (!auth.ok) return unauthorized();

  const body = await req.json().catch(() => null) as {
    dataBase64?: string;
    sourceUrl?: string;
    svg?: string;
    width?: unknown;
    height?: unknown;
    contentType?: string;
    filename?: string;
    alt?: string;
    title?: string;
    folder?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });

  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  const svg = typeof body.svg === "string" ? body.svg.trim() : "";
  const given = [sourceUrl && "sourceUrl", svg && "svg", dataBase64 && "dataBase64"].filter(Boolean);
  if (given.length === 0) {
    return NextResponse.json(
      { error: "Say where the image is. sourceUrl: a public image URL this server downloads itself. svg: SVG markup this server rasterizes itself, for an image you draw rather than photograph. dataBase64: the bytes inline, base64-encoded -- only workable for a tiny image, since the whole thing has to fit in this request." },
      { status: 400 }
    );
  }
  if (given.length > 1) {
    return NextResponse.json({ error: `Pass exactly one of sourceUrl, svg or dataBase64 -- got ${given.join(" and ")}.` }, { status: 400 });
  }

  const dimension = (value: unknown): number | undefined => {
    const n = typeof value === "string" ? Number(value) : value;
    return typeof n === "number" && Number.isFinite(n) && n >= 16 && n <= 4096 ? Math.round(n) : undefined;
  };

  let bytes: Buffer;
  let contentType: string;

  if (svg) {
    const problem = rejectUnsafeSvg(svg);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    try {
      bytes = await rasterizeSvg(svg, { width: dimension(body.width), height: dimension(body.height) });
    } catch (error) {
      return NextResponse.json(
        { error: `Could not render that SVG: ${error instanceof Error ? error.message : "unknown error"}. Check it parses as XML (every tag closed, every attribute quoted).` },
        { status: 400 }
      );
    }
    contentType = "image/png";
  } else if (sourceUrl) {
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      return NextResponse.json({ error: `sourceUrl isn't a valid absolute URL: "${sourceUrl.slice(0, 120)}". It needs the scheme too, e.g. https://example.com/image.png.` }, { status: 400 });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return NextResponse.json({ error: "sourceUrl must be an http:// or https:// URL. For bytes you already hold, use dataBase64 instead." }, { status: 400 });
    }
    try {
      const fetched = await fetchSafeRemoteImage(sourceUrl);
      bytes = fetched.bytes;
      contentType = body.contentType || fetched.contentType;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not download it.";
      return NextResponse.json({ error: `Couldn't fetch sourceUrl (${parsed.hostname}): ${reason}` }, { status: 400 });
    }
  } else {
    if (dataBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        {
          error:
            `dataBase64 is ${dataBase64.length.toLocaleString()} characters, over the ${MAX_BASE64_LENGTH.toLocaleString()} this route accepts (5MB of image). Don't shrink the image to get under it -- pass sourceUrl with a public URL to the image instead and the server downloads it directly, at any size up to 5MB.`,
        },
        { status: 413 }
      );
    }
    const decoded = decodeDataPayload(dataBase64);
    if (!decoded || decoded.bytes.length === 0) {
      return NextResponse.json({ error: "Couldn't decode dataBase64 as base64 image bytes. Check it isn't truncated, or pass sourceUrl instead." }, { status: 400 });
    }
    bytes = decoded.bytes;
    contentType = body.contentType || decoded.mimeFromDataUri || "";
  }

  contentType = contentType.split(";")[0].trim().toLowerCase();
  const ext = ALLOWED_IMAGE_TYPES[contentType];
  if (!ext) {
    return NextResponse.json(
      { error: `${contentType ? `"${contentType}" isn't a supported image type` : "Couldn't tell what kind of image this is"}. contentType must be one of: ${Object.keys(ALLOWED_IMAGE_TYPES).join(", ")}.` },
      { status: 400 }
    );
  }
  if (bytes.length > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: `That image is ${(bytes.length / 1024 / 1024).toFixed(1)}MB, over the 5MB limit.` }, { status: 413 });
  }

  const filename = (typeof body.filename === "string" && body.filename.trim()) || `upload.${ext}`;
  const file = new File([Uint8Array.from(bytes)], filename, { type: contentType });

  const result = await uploadMediaLibraryImage(file, body.folder || "uploads", { alt: body.alt, title: body.title });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ...result, bytes: bytes.length, sourceContentType: contentType }, { status: 201 });
}
