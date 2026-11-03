/** How many logos the directory hero's strip shows. Enough to fill it
 * twice on a wide screen without shipping every logo in the directory. */
export const HERO_LOGO_COUNT = 16;

export type HeroLogo = { slug: string; name: string; logo_url: string };

/**
 * A rotating window of tool logos for the /tools hero.
 *
 * Taking the first sixteen showed the same sixteen logos forever, which is
 * what the owner noticed. This walks the list instead, advancing one
 * window per `bucketMs` (matched to the page's `revalidate`), so the strip
 * is a different set of real listings through the day and every tool with
 * a logo eventually appears.
 *
 * The offset comes from the clock rather than `Math.random` on purpose:
 * the page is server rendered, and a random pick during render would not
 * match what the client hydrates, which React treats as a mismatch and
 * discards. A time bucket is the same value for every render inside the
 * window, so there is nothing to mismatch.
 *
 * Lives in its own file, with no database import, so it can be unit
 * tested -- `lib/directory.ts` opens a connection pool on import.
 */
export function heroLogoWindow(
  tools: { slug: string; name: string; logo_url: string | null }[],
  bucketMs = 300_000,
  now = Date.now(),
): HeroLogo[] {
  // Projected to three fields rather than filtered in place. Filtering
  // returns the caller's own objects, and the caller here is holding full
  // directory rows, so sixteen descriptions and screenshot arrays rode
  // into the client payload behind a prop that only ever renders a logo.
  const withLogos = tools
    .filter((t) => Boolean(t.logo_url))
    .map((t) => ({ slug: t.slug, name: t.name, logo_url: t.logo_url as string }));
  if (withLogos.length <= HERO_LOGO_COUNT) return withLogos;
  const offset = Math.floor(now / bucketMs) % withLogos.length;
  return Array.from(
    { length: HERO_LOGO_COUNT },
    (_, i) => withLogos[(offset + i) % withLogos.length],
  );
}
