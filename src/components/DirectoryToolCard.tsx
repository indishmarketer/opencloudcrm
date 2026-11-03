import Link from "next/link";
import Image from "next/image";

const PRICING_LABELS: Record<string, string> = {
  free: "Free",
  freemium: "Freemium",
  paid: "Paid",
  free_api: "Free API",
  paid_api: "Paid API",
};

export type DirectoryToolCardData = {
  /** Only used for the "newest" sort on /tools; the card never shows it. */
  id?: number;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  pricing_type: string;
  category_slug?: string;
  category_name?: string;
  subcategory?: string | null;
  featured?: boolean;
};

export default function DirectoryToolCard({ tool }: { tool: DirectoryToolCardData }) {
  return (
    <Link
      href={`/tools/${tool.category_slug}/${tool.slug}`}
      className="group flex min-h-52 flex-col rounded-2xl border border-line bg-paper p-5 transition-colors hover:border-ink/50 hover:bg-paper-soft"
    >
      <div className="flex items-start gap-3">
        {tool.logo_url ? (
          <Image
            src={tool.logo_url}
            alt={`${tool.name} logo`}
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-xl border border-line bg-paper object-contain p-1"
          />
        ) : (
          <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-paper font-display text-lg font-semibold">
            {tool.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* No hover underline on the name. The whole card is the link
                and already lifts its border on hover, so underlining the
                title as well read as a stray text link inside the card. */}
            <p className="font-display text-base font-semibold leading-tight">{tool.name}</p>
            {tool.featured && (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-paper">
                Featured
              </span>
            )}
          </div>
          {tool.tagline && <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink-soft">{tool.tagline}</p>}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink">
          {PRICING_LABELS[tool.pricing_type] || tool.pricing_type}
        </span>
        {tool.category_name && (
          <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-ink-soft">
            {tool.category_name}
          </span>
        )}
        <span className="ml-auto text-xs font-medium text-ink-soft group-hover:text-ink">
          View details <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}
