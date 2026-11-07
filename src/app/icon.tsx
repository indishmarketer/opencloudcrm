import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSiteIdentity } from "@/lib/siteIdentity";
import { SITE_URL } from "@/config/brand";

// A real image file (icon.png) can't branch on the console-configured
// favicon, and Next.js always places a static icon/favicon file ahead of
// anything generateMetadata() returns -- see resolve-metadata.js's
// leafSegmentStaticIcons.unshift(...), which put the old static file
// first in the <link> list regardless of what layout.tsx's metadata
// object said. A code-generated icon route is the only way to actually
// serve the owner's chosen favicon (Console -> Site identity -> Favicon).
export const size = { width: 512, height: 512 };
export const contentType = "image/png";
// DB-backed, so not static by default; revalidatePath("/", "layout") in
// the site-identity save route invalidates this immediately on save --
// this is only a safety net, matching sitemap.ts's same pattern.
export const revalidate = 300;

// Copied into the Docker image's runner stage via `COPY public ./public`
// (Dockerfile) -- src/app/ itself isn't, so this can't live there.
const DEFAULT_ICON_PATH = path.join(process.cwd(), "public", "default-favicon.png");

export default async function Icon() {
  const identity = await getSiteIdentity();
  if (identity.faviconUrl) {
    const target = identity.faviconUrl.startsWith("/") ? `${SITE_URL}${identity.faviconUrl}` : identity.faviconUrl;
    return Response.redirect(target, 307);
  }
  const bytes = await readFile(DEFAULT_ICON_PATH);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/png" } });
}
