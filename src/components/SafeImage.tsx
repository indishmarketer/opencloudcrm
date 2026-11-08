import Image, { type ImageProps } from "next/image";
import { isKnownImageHost } from "@/lib/liveImageHost";

/** Drop-in replacement for next/image's <Image> for any src that isn't a
 * guaranteed-local path -- DB/R2-sourced content (course covers, blog
 * images, avatars, tool logos, uploaded screenshots, etc.). Automatically
 * sets `unoptimized` for any host next.config.ts's images.remotePatterns
 * wasn't built to recognize, which on the project's generic self-host
 * image (remotePatterns frozen to brand.ts's defaults -- see
 * src/lib/liveImageHost.ts) is every real deployment's actual content.
 * Without this, next/image's own optimizer 400s with no visible error
 * beyond a missing picture (confirmed on course cover/trainer images --
 * see src/app/courses/page.tsx and src/app/courses/[slug]/page.tsx,
 * the first two places this was actually fixed).
 *
 * Callers can still pass `unoptimized` explicitly to override this. */
export default function SafeImage({ src, unoptimized, ...props }: ImageProps) {
  const resolvedUnoptimized = unoptimized ?? !isKnownImageHost(typeof src === "string" ? src : "");
  return <Image src={src} unoptimized={resolvedUnoptimized} {...props} />;
}
