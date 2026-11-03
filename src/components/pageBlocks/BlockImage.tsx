import Image from "next/image";
import { ASSET_DOMAIN, SITE_URL } from "@/config/brand";

const OPTIMIZABLE_HOSTS = new Set([ASSET_DOMAIN, new URL(SITE_URL).hostname, "i.ytimg.com"]);

/** next/image only optimizes hosts listed in next.config's remotePatterns
 * and throws on any other. Page-builder images can come from anywhere (an
 * uploaded file, a pasted URL), so unknown hosts render unoptimized
 * instead of breaking the page. */
function isOptimizable(src: string): boolean {
  if (src.startsWith("/")) return true;
  try {
    return OPTIMIZABLE_HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}

export default function BlockImage({
  src,
  alt,
  sizes,
  className,
  priority,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      unoptimized={!isOptimizable(src)}
    />
  );
}
