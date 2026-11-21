/** Public product areas intentionally retired from the hardcoded Indish
 * Marketer site. Keep this in code so database-managed navigation cannot
 * accidentally make an old feature visible again. */
export function isRetiredPublicPath(href: string): boolean {
  // services/products: the agency pages, retired with the voice-agent product
  // they linked to. resources: the "Free resources" hub and the whole
  // prompt & skill library under it. community/webinars: both features were
  // removed outright, code and tables. Listed here as well as deleted so a
  // stale database nav row, an old blog link or a cached sitemap entry
  // cannot surface them again. /guide used to be a public lead-magnet page;
  // guide delivery is now a popup plus a direct R2 document link.
  //
  // The two console paths are here for a different reason than the rest.
  // Their screens were deleted, so Next falls through to the [...slug]
  // catch-all, which answers an unknown path by sending it to "/" -- that
  // left /console/webinars quietly rendering the public home page instead
  // of saying the section is gone. 410 is the honest answer.
  return (
    /^\/(?:community|webinars|new-newsletter|services|products|resources|guide)(?:\/|$)/.test(href)
    || /^\/console\/(?:community|webinars)(?:\/|$)/.test(href)
  );
}
