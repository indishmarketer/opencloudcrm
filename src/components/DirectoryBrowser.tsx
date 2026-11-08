"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SafeImage from "@/components/SafeImage";
import Link from "next/link";
import DirectoryToolCard, { type DirectoryToolCardData } from "@/components/DirectoryToolCard";
import BrandSelect from "@/components/BrandSelect";

const PRICING_OPTIONS = [
  { value: "", label: "All pricing" },
  { value: "free", label: "Free" },
  { value: "freemium", label: "Freemium" },
  { value: "paid", label: "Paid" },
  { value: "free_api", label: "Free API" },
  { value: "paid_api", label: "Paid API" },
];

const SORT_OPTIONS = [
  { value: "featured", label: "Sort: Featured" },
  { value: "newest", label: "Sort: Newest" },
  { value: "az", label: "Sort: A-Z" },
  { value: "za", label: "Sort: Z-A" },
];

const PER_PAGE = 24;

export type DirectoryBrowserCategory = { slug: string; name: string; tool_count: number };

/**
 * The whole of /tools: hero, filters, results, pagination.
 *
 * It is one client component because all four parts read the same state.
 * The search box lives in the hero, the category and pricing pickers sit
 * under it, and the page number has to reset the moment any of them
 * change -- splitting them would mean lifting that state into the page and
 * making the page a client component anyway.
 *
 * **Category is a filter here, not a grid.** /tools used to print every
 * category as a card above the results. The owner's objection was that it
 * pushed the tools themselves below the fold and duplicated a control that
 * already existed. Each category still has its own indexed page at
 * /tools/<slug>, reachable from the card chips and the sitemap; this
 * picker just narrows the list in place, which is what somebody who
 * already knows what they want is after.
 */
export default function DirectoryBrowser({
  tools,
  categories,
  heroLogos,
  initialPricing,
  initialCategory,
  priceLabel,
}: {
  tools: DirectoryToolCardData[];
  categories: DirectoryBrowserCategory[];
  /** Chosen on the server so the set rotates between renders without a
   * hydration mismatch -- see `heroLogoWindow` in lib/directory.ts. */
  heroLogos: { slug: string; name: string; logo_url: string }[];
  initialPricing?: string;
  initialCategory?: string;
  /** The paid tier fee as text; the console setting, not a literal. */
  priceLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [pricing, setPricing] = useState(initialPricing || "");
  const [category, setCategory] = useState(initialCategory || "");
  const [sort, setSort] = useState("featured");
  const [page, setPage] = useState(1);
  const resultsTop = useRef<HTMLDivElement>(null);

  const categoryOptions = useMemo(
    () => [
      { value: "", label: `All categories (${tools.length})` },
      ...categories
        .filter((c) => c.tool_count > 0)
        .map((c) => ({ value: c.slug, label: `${c.name} (${c.tool_count})` })),
    ],
    [categories, tools.length],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = tools.filter((t) => {
      if (pricing && t.pricing_type !== pricing) return false;
      if (category && t.category_slug !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.tagline || "").toLowerCase().includes(q) ||
        (t.category_name || "").toLowerCase().includes(q) ||
        (t.subcategory || "").toLowerCase().includes(q)
      );
    });

    if (sort === "az") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "za") {
      result.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sort === "newest") {
      // The server already orders by featured then name, so a stable sort
      // on the id keeps "newest" meaningful without a second query.
      result.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    } else {
      result.sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    return result;
  }, [tools, query, pricing, category, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // Clamp rather than reset: changing a filter while on page 5 of 9 should
  // land on the last page of the new result set, not silently show nothing.
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPage(1);
  }, [query, pricing, category, sort]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function goToPage(next: number) {
    setPage(next);
    resultsTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const activeCategoryName = category
    ? categories.find((c) => c.slug === category)?.name || null
    : null;

  return (
    <div>
      <section className="relative overflow-hidden rounded-3xl bg-ink px-6 py-14 text-paper sm:px-10 sm:py-20">
        <div aria-hidden="true" className="absolute inset-0">
          <div className="directory-hero-grid absolute inset-0" />
          <div className="directory-hero-glow directory-hero-glow-a" />
          <div className="directory-hero-glow directory-hero-glow-b" />
        </div>

        <div className="relative mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-paper/60">
            Tools &amp; software directory
          </p>
          <h1 className="mt-4 text-balance font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Find the tool that does the job
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-balance leading-7 text-paper/70">
            {tools.length} AI agents, automations, CRMs and open source tools we have vetted or built
            with. Search by what you need, filter by category and price. No pay-to-rank listings.
          </p>

          <div className="mt-8">
            <div className="flex items-center gap-2 rounded-2xl border border-paper/15 bg-paper/10 p-2 backdrop-blur-sm transition-colors focus-within:border-paper/50 sm:gap-3 sm:p-2.5">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="ml-2 h-5 w-5 shrink-0 text-paper/60 sm:ml-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
              </svg>
              <label className="sr-only" htmlFor="directory-search">
                Search the tools directory
              </label>
              <input
                id="directory-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search 'CRM', 'free API', 'email tool'..."
                className="min-w-0 flex-1 bg-transparent py-3 text-base text-paper outline-none placeholder:text-paper/50 sm:py-4"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="shrink-0 rounded-full px-3 py-2 text-xs font-medium text-paper/70 transition-colors hover:text-paper"
                >
                  Clear
                </button>
              )}
              <Link
                href="/tools/submit"
                className="hidden shrink-0 rounded-xl bg-paper px-5 py-3.5 text-sm font-medium text-ink transition-opacity hover:opacity-85 sm:block"
              >
                Submit your tool
              </Link>
            </div>
            <Link
              href="/tools/submit"
              className="mt-3 block rounded-xl bg-paper px-5 py-3 text-center text-sm font-medium text-ink transition-opacity hover:opacity-85 sm:hidden"
            >
              Submit your tool
            </Link>
          </div>

          <p className="mt-5 text-xs text-paper/50">
            Free listing with our badge on your site, or {priceLabel} for a reviewed listing with no
            badge. Every link is nofollow, both ways.
          </p>
        </div>

        {heroLogos.length > 0 && (
          <div aria-hidden="true" className="tool-logo-marquee-viewport relative mt-12 sm:mt-16">
            <div className="tool-logo-marquee gap-4">
              {[...heroLogos, ...heroLogos].map((tool, index) => (
                <span
                  key={`${tool.slug}-${index}`}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-paper/15 bg-paper/10 p-2"
                >
                  <SafeImage
                    src={tool.logo_url}
                    alt=""
                    width={40}
                    height={40}
                    className="h-9 w-9 object-contain opacity-80"
                  />
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div ref={resultsTop} className="scroll-mt-24" />

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
        <BrandSelect
          value={category}
          onChange={setCategory}
          options={categoryOptions}
          searchable
          searchPlaceholder="Search categories…"
          className="sm:w-64"
        />
        <BrandSelect value={pricing} onChange={setPricing} options={PRICING_OPTIONS} className="sm:w-44" />
        <BrandSelect value={sort} onChange={setSort} options={SORT_OPTIONS} className="sm:w-44" />
        <p className="text-sm text-ink-soft sm:ml-auto">
          {filtered.length} {filtered.length === 1 ? "tool" : "tools"}
          {activeCategoryName ? ` in ${activeCategoryName}` : ""}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="font-display text-lg font-semibold">Nothing matches that yet</p>
          <p className="mt-2 text-sm text-ink-soft">
            Try a shorter search, or clear the filters.{" "}
            <Link href="/tools/submit" className="underline underline-offset-2 hover:text-ink">
              Know a tool that belongs here?
            </Link>
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((tool) => (
              <DirectoryToolCard key={tool.slug} tool={tool} />
            ))}
          </div>

          {/* One row, always. It used to wrap, which dropped "Next" onto a
              line of its own under the numbers on a phone. Three things
              keep it on one line at 360px: the arrows lose their words
              below `sm`, the number window is narrower than it used to be
              (see pageRange), and nothing is allowed to wrap. */}
          {pageCount > 1 && (
            <nav
              aria-label="Directory pages"
              className="mt-10 flex flex-nowrap items-center justify-center gap-1.5 sm:gap-2"
            >
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="shrink-0 rounded-full border border-line px-3 py-2 text-sm font-medium transition-colors hover:border-ink disabled:opacity-40 disabled:hover:border-line sm:px-4"
              >
                <span aria-hidden="true" className="sm:hidden">
                  &larr;
                </span>
                <span className="hidden sm:inline">Previous</span>
              </button>
              {pageRange(currentPage, pageCount).map((entry, index) =>
                entry === null ? (
                  <span key={`gap-${index}`} aria-hidden="true" className="px-0.5 text-sm text-ink-soft">
                    &hellip;
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => goToPage(entry)}
                    aria-label={`Page ${entry}`}
                    aria-current={entry === currentPage ? "page" : undefined}
                    className={`min-w-9 shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition-colors sm:min-w-10 sm:px-3.5 ${
                      entry === currentPage
                        ? "border-ink bg-ink text-paper"
                        : "border-line hover:border-ink"
                    }`}
                  >
                    {entry}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === pageCount}
                aria-label="Next page"
                className="shrink-0 rounded-full border border-line px-3 py-2 text-sm font-medium transition-colors hover:border-ink disabled:opacity-40 disabled:hover:border-line sm:px-4"
              >
                <span aria-hidden="true" className="sm:hidden">
                  &rarr;
                </span>
                <span className="hidden sm:inline">Next</span>
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

/**
 * First page, last page, the current page and its neighbours, with nulls
 * where numbers were skipped.
 *
 * At most five entries, so at most three numbers once it starts skipping.
 * The budget is a 360px phone with 16px gutters: two arrow buttons at
 * ~34px, three numbers at ~40px (two digits), two ellipses, and the gaps
 * come to ~250px. The old version showed every page up to seven, which
 * overflowed and wrapped "Next" onto a line of its own -- which is what
 * the owner screenshotted. Five pages or fewer still show in full, so the
 * common case today (four pages) is unchanged.
 */
function pageRange(current: number, total: number): (number | null)[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, current, total]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}
