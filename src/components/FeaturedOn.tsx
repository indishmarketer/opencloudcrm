export type Listing = { href: string; badge: string; width: number; height: number; alt: string };

/**
 * The "Featured on" strip: a page builder block (type "featuredOn"), its
 * badges edited like any other list field in the console -- not hardcoded,
 * since this is a public, self-hostable product and a hardcoded list would
 * be one deployment's own real backlinks shipped to every install. This
 * file only decides how the marquee looks.
 *
 * **Why a CSS marquee and not a slideshow.** Every one of these directories
 * re-checks this page for its own badge and withdraws the free dofollow
 * listing if it stops finding one. A carousel that mounts one slide at a
 * time, or that swaps `src` as it rotates, would hide most of the badges
 * from anything fetching the HTML, and the listings would start failing
 * their checks weeks later with nothing obvious to link it to. So every
 * badge and every link is rendered server side, all of the time, and only a
 * transform moves them. This is the whole reason the component is shaped
 * this way; do not replace it with a JS carousel library.
 *
 * The track renders the list twice and slides exactly half its own width,
 * which is what makes the loop seamless. The second copy is decoration for
 * the seam, so it is `aria-hidden` and screen readers hear the list once.
 *
 * Badges are normalised to a single display *height*, not width: they are
 * pills of very different proportions (LaunchFree 250x56, ListBulb 720x240)
 * and matching heights is what makes a mixed set read as one row. They stay
 * small because the list keeps growing and this is supporting evidence
 * under the hero, not a feature of the page.
 *
 * Images are lazy, async and carry explicit dimensions. They come from
 * seven different third-party servers answering in 0.7s to 1.9s, so the
 * dimensions are what stop the strip reflowing as each one lands.
 */

function BadgeItem({ listing, copy }: { listing: Listing; copy?: boolean }) {
  return (
    <li
      // The duplicate is announced to nobody and tabbed to by nobody; the
      // CSS also uses this attribute to drop it under reduced motion.
      aria-hidden={copy || undefined}
      data-marquee-copy={copy ? "true" : undefined}
      className="flex shrink-0 items-center justify-center px-4 sm:px-5"
    >
      <a
        href={listing.href}
        target="_blank"
        rel="noopener"
        tabIndex={copy ? -1 : undefined}
        className="block rounded-xl opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={listing.badge}
          alt={copy ? "" : listing.alt}
          width={listing.width}
          height={listing.height}
          loading="lazy"
          decoding="async"
          className="h-8 w-auto max-w-none sm:h-9 lg:h-10"
        />
      </a>
    </li>
  );
}

export default function FeaturedOn({
  heading,
  listings,
  editorEmpty = false,
}: {
  heading: string;
  listings: Listing[];
  /** A freshly-added block has no badges yet, and this renders nothing
   * until it does -- right for a real page, wrong for the editor canvas,
   * where that makes the block invisible and unselectable. Only the
   * editor's own call site passes this. */
  editorEmpty?: boolean;
}) {
  if (listings.length === 0) {
    if (!editorEmpty) return null;
    return (
      <section className="border-b border-line bg-paper-soft">
        <div className="mx-auto max-w-6xl px-6 py-8 sm:py-10">
          <div className="flex min-h-[72px] items-center justify-center rounded-xl border border-dashed border-line bg-paper px-6 py-8 text-center text-sm text-ink-soft">
            Add badges in the panel on the right
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="featured-on-heading" className="border-b border-line bg-paper-soft">
      <div className="mx-auto max-w-6xl py-8 sm:py-10">
        <h2
          id="featured-on-heading"
          className="px-6 text-center text-xs font-medium uppercase tracking-widest text-ink-soft"
        >
          {heading || "Featured on"}
        </h2>
        <div className="badge-marquee-viewport mt-5 sm:mt-6">
          <ul className="badge-marquee">
            {listings.map((listing) => (
              <BadgeItem key={listing.href} listing={listing} />
            ))}
            {listings.map((listing) => (
              <BadgeItem key={`copy-${listing.href}`} listing={listing} copy />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
