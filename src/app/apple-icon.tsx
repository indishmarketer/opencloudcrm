import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSiteIdentity } from "@/lib/siteIdentity";
import { SITE_URL } from "@/lib/liveSiteUrl";

// See icon.tsx for why this has to be code-generated rather than a static
// apple-icon.png -- same reasoning, same Console -> Site identity ->
// Favicon field.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const revalidate = 300;

const DEFAULT_ICON_PATH = path.join(process.cwd(), "public", "default-favicon.png");

export default async function AppleIcon() {
  const identity = await getSiteIdentity();
  if (identity.faviconUrl) {
    const target = identity.faviconUrl.startsWith("/") ? `${SITE_URL}${identity.faviconUrl}` : identity.faviconUrl;
    return Response.redirect(target, 307);
  }
  const bytes = await readFile(DEFAULT_ICON_PATH);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/png" } });
}
