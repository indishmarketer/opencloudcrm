import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";

type PexelsPhoto = {
  id: number;
  alt?: string;
  photographer?: string;
  photographer_url?: string;
  url?: string;
  src?: { small?: string; medium?: string; large?: string };
};

function pexelsUrl(value: unknown, host: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === host ? url.href : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.PEXELS_API_KEY;
  if (!key) return NextResponse.json({ error: "Pexels search is not configured yet." }, { status: 503 });

  const query = req.nextUrl.searchParams.get("query")?.trim() || "";
  const page = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("page") || "1")));
  if (query.length < 2 || query.length > 120) {
    return NextResponse.json({ error: "Enter a search with 2 to 120 characters." }, { status: 400 });
  }

  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", "18");
  url.searchParams.set("page", String(page));

  try {
    const response = await fetch(url, {
      headers: { Authorization: key },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const message = response.status === 429 ? "Pexels search is temporarily rate limited. Try again later." : "Pexels could not complete the search.";
      return NextResponse.json({ error: message }, { status: response.status === 429 ? 429 : 502 });
    }
    const result = await response.json() as { photos?: PexelsPhoto[]; total_results?: number; page?: number };
    const photos = (result.photos || []).flatMap((photo) => {
      const thumbnail = pexelsUrl(photo.src?.medium || photo.src?.small, "images.pexels.com");
      const photoUrl = pexelsUrl(photo.url, "www.pexels.com");
      const photographerUrl = pexelsUrl(photo.photographer_url, "www.pexels.com");
      if (!Number.isSafeInteger(photo.id) || !thumbnail || !photoUrl || !photographerUrl) return [];
      return [{
        id: photo.id,
        alt: typeof photo.alt === "string" ? photo.alt.slice(0, 300) : "",
        photographer: typeof photo.photographer === "string" ? photo.photographer.slice(0, 100) : "Pexels photographer",
        photographerUrl,
        photoUrl,
        thumbnail,
      }];
    });
    return NextResponse.json({ photos, page: result.page || page, totalResults: result.total_results || 0 });
  } catch {
    return NextResponse.json({ error: "Pexels could not be reached. Try again in a moment." }, { status: 502 });
  }
}
