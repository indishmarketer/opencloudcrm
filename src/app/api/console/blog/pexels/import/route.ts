import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { uploadWebpImageToR2 } from "@/lib/r2Upload";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } from "@/lib/imagePolicy";

type PexelsPhoto = {
  id: number;
  alt?: string;
  photographer?: string;
  photographer_url?: string;
  url?: string;
  src?: { large?: string };
};

function isPexelsPage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.pexels.com";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.PEXELS_API_KEY;
  if (!key) return NextResponse.json({ error: "Pexels search is not configured yet." }, { status: 503 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const photoId = body.photoId;
  if (typeof photoId !== "number" || !Number.isSafeInteger(photoId) || photoId < 1) {
    return NextResponse.json({ error: "Choose a valid Pexels photo." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.pexels.com/v1/photos/${photoId}`, {
      headers: { Authorization: key },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return NextResponse.json({ error: "Pexels could not load that photo." }, { status: 502 });
    const photo = await response.json() as PexelsPhoto;
    const source = typeof photo.src?.large === "string" ? new URL(photo.src.large) : null;
    if (!source || source.protocol !== "https:" || source.hostname !== "images.pexels.com" || !isPexelsPage(photo.url)) {
      return NextResponse.json({ error: "Pexels returned an invalid photo link." }, { status: 502 });
    }

    const imageResponse = await fetch(source, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!imageResponse.ok) return NextResponse.json({ error: "That photo could not be downloaded." }, { status: 502 });
    const contentType = imageResponse.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
    if (!Object.hasOwn(ALLOWED_IMAGE_TYPES, contentType)) return NextResponse.json({ error: "Pexels returned an unsupported image type." }, { status: 502 });
    const declaredSize = Number(imageResponse.headers.get("content-length") || "0");
    if (declaredSize > MAX_IMAGE_SIZE) return NextResponse.json({ error: "That photo is too large to import." }, { status: 413 });
    const bytes = await imageResponse.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_SIZE) return NextResponse.json({ error: "That photo is too large to import." }, { status: 413 });

    const file = new File([bytes], `pexels-${photoId}`, { type: contentType });
    const uploaded = await uploadWebpImageToR2(file, "blog-images");
    if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });

    const photographerUrl = typeof photo.photographer_url === "string" ? new URL(photo.photographer_url) : null;
    return NextResponse.json({
      url: uploaded.url,
      alt: typeof photo.alt === "string" ? photo.alt.slice(0, 300) : "",
      photographer: typeof photo.photographer === "string" ? photo.photographer.slice(0, 100) : "Pexels photographer",
      photographerUrl: photographerUrl?.protocol === "https:" && photographerUrl.hostname === "www.pexels.com" ? photographerUrl.href : "https://www.pexels.com",
      photoUrl: photo.url,
    });
  } catch {
    return NextResponse.json({ error: "Pexels could not import that photo. Try another one." }, { status: 502 });
  }
}
