import Link from "next/link";
import SafeImage from "@/components/SafeImage";

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
      className="group flex min-h-52 flex-col rounded-2xl border border-line bg-paper p-5 transition-all duration-300 hover:border-accent hover:shadow-[0_16px_36px_-12px_rgba(109,40,217,0.22)] hover:-translate-y-1"
    >
      <div className="flex items-start gap-3">
        {tool.logo_url ? (
          <SafeImage
            src={tool.logo_url}
            alt={`${tool.name} logo`}
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-xl border border-line bg-paper object-contain p-1 transition-transform group-hover:scale-105"
          />
        ) : (
          <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent-soft font-display text-lg font-semibold text-accent">
            {tool.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-semibold leading-tight text-ink transition-colors group-hover:text-accent">{tool.name}</p>
            {tool.featured && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-on shadow-sm">
                Featured
              </span>
            )}
          </div>
          {tool.tagline && <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink-soft">{tool.tagline}</p>}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
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
