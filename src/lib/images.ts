import { SITE_URL } from "@/lib/liveSiteUrl";

// Feature images still live on the Ghost instance until migrated to R2.
// Swap GHOST_ORIGIN -> the asset CDN domain once migration runs.
const GHOST_ORIGIN = SITE_URL;

export function resolveImage(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace("__GHOST_URL__", GHOST_ORIGIN);
}
