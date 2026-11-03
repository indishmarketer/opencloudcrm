import Link from "next/link";
import { getDirectoryListingPrice, formatListingPrice } from "@/lib/directoryListingPrice";

/**
 * "Submit your tool" in the one place it is useful: beside whatever listing
 * somebody is already looking at.
 *
 * The owner's note was that the call to action only existed on /tools and
 * the submit page itself, so the people most likely to act on it -- a
 * founder reading a competitor's listing -- never saw it. It is deliberately
 * shown to everyone, including people who have already submitted something:
 * one person can own several tools, and nothing about the listing flow
 * limits them to one.
 *
 * `variant="panel"` is the sidebar card used on a tool page. `variant="wide"`
 * is the full-width band for the bottom of a category page.
 */
export default async function SubmitToolCta({
  variant = "panel",
  className = "",
}: {
  variant?: "panel" | "wide";
  className?: string;
}) {
  // Fetched here rather than drilled down from every page that renders
  // this: it is one indexed read on pages that are already ISR cached, and
  // the alternative is four call sites that can each quote a stale fee.
  const priceLabel = formatListingPrice((await getDirectoryListingPrice()).usd, "USD");
  if (variant === "wide") {
    return (
      <section
        className={`flex flex-col items-start gap-5 rounded-3xl bg-ink p-6 text-paper sm:flex-row sm:items-center sm:justify-between sm:p-8 ${className}`}
      >
        <div>
          <h2 className="font-display text-xl font-semibold">Built a tool marketers should know about?</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-paper/70">
            Paste your link and we read your page for you. Free with our badge on your site, or{" "}
            {priceLabel} for a reviewed listing with no badge. Every listing is checked by hand.
          </p>
        </div>
        <Link
          href="/tools/submit"
          className="shrink-0 rounded-full bg-paper px-6 py-3 text-sm font-medium text-ink transition-opacity hover:opacity-85"
        >
          Submit your tool
        </Link>
      </section>
    );
  }

  return (
    <aside className={`rounded-3xl border border-line bg-paper-soft p-5 sm:p-6 ${className}`}>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-soft">Your tool</p>
      <p className="mt-3 text-sm font-medium leading-6">List your own tool in this directory</p>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Free with our badge, or {priceLabel} reviewed first. Takes about two minutes.
      </p>
      <Link
        href="/tools/submit"
        className="mt-4 block rounded-full bg-ink px-5 py-3 text-center text-sm font-medium text-paper transition-opacity hover:opacity-80"
      >
        Submit your tool
      </Link>
    </aside>
  );
}
