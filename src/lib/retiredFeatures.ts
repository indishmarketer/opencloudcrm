/** Public product areas intentionally retired from the hardcoded Indish
 * Marketer site. Keep this in code so database-managed navigation cannot
 * accidentally make an old feature visible again. */
export function isRetiredPublicPath(href: string): boolean {
  return /^\/(?:community|webinars)(?:\/|$)/.test(href);
}
