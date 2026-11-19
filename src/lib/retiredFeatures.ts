/** Public product areas intentionally retired from the hardcoded Indish
 * Marketer site. Keep this in code so database-managed navigation cannot
 * accidentally make an old feature visible again. */
export function isRetiredPublicPath(href: string): boolean {
  // services/products: the agency pages, retired with the voice-agent product
  // they linked to. resources: the "Free resources" hub and the whole
  // prompt & skill library under it. Listed here as well as deleted so a
  // stale database nav row, an old blog link or a cached sitemap entry
  // cannot surface them again.
  return /^\/(?:community|webinars|new-newsletter|services|products|resources)(?:\/|$)/.test(href);
}
