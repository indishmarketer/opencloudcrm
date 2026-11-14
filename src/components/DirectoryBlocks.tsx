"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import BrandSelect from "@/components/BrandSelect";
import DirectoryToolCard, { type DirectoryToolCardData } from "@/components/DirectoryToolCard";
import { surfaceStyle } from "@/lib/colorValue";

export type DirectoryData = {
  tools: DirectoryToolCardData[];
  categories: { slug: string; name: string; tool_count: number }[];
  heroLogos: { slug: string; name: string; logo_url: string }[];
  priceLabel: string;
};

type DirectoryState = DirectoryData & {
  query: string;
  setQuery: (value: string) => void;
  pricing: string;
  setPricing: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
  page: number;
  setPage: (value: number) => void;
};

const DirectoryContext = createContext<DirectoryState | null>(null);
const PER_PAGE = 24;
const PRICING_OPTIONS = [
  { value: "", label: "All pricing" }, { value: "free", label: "Free" },
  { value: "freemium", label: "Freemium" }, { value: "paid", label: "Paid" },
  { value: "free_api", label: "Free API" }, { value: "paid_api", label: "Paid API" },
];
const SORT_OPTIONS = [
  { value: "featured", label: "Sort: Featured" }, { value: "newest", label: "Sort: Newest" },
  { value: "az", label: "Sort: A-Z" }, { value: "za", label: "Sort: Z-A" },
];

export function DirectoryProvider({ data, initialPricing, initialCategory, children }: {
  data: DirectoryData;
  initialPricing?: string;
  initialCategory?: string;
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [pricing, setPricing] = useState(initialPricing || "");
  const [category, setCategory] = useState(initialCategory || "");
  const [sort, setSort] = useState("featured");
  const [page, setPage] = useState(1);
  return <DirectoryContext.Provider value={{ ...data, query, setQuery, pricing, setPricing, category, setCategory, sort, setSort, page, setPage }}>{children}</DirectoryContext.Provider>;
}

function useDirectory() { return useContext(DirectoryContext); }
function str(props: Record<string, unknown>, key: string, fallback = "") {
  const value = props[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function number(props: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(props[key]);
  return Number.isFinite(value) ? value : fallback;
}
function sectionStyle(props: Record<string, unknown>): React.CSSProperties {
  return {
    paddingTop: number(props, "paddingY", 48), paddingBottom: number(props, "paddingY", 48),
    paddingLeft: number(props, "paddingX", 24), paddingRight: number(props, "paddingX", 24),
    marginTop: number(props, "marginTop", 0), marginBottom: number(props, "marginBottom", 0),
    borderRadius: number(props, "borderRadius", 0),
    ...surfaceStyle(str(props, "backgroundColor")),
  };
}
function elementStyle(props: Record<string, unknown>): React.CSSProperties {
  return { ...sectionStyle({ paddingY: 0, paddingX: 0, ...props }), color: str(props, "textColor") || undefined };
}

export function DirectorySearchBlock({ props }: { props: Record<string, unknown> }) {
  const directory = useDirectory();
  if (!directory) return null;
  const placeholder = str(props, "placeholder", "Search 'CRM', 'free API', 'email tool'...");
  const label = str(props, "submitLabel", "Submit your tool");
  return (
    <div style={{ ...elementStyle(props), maxWidth: number(props, "maxWidth", 960) || 960, marginInline: "auto" }}>
      <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 backdrop-blur-sm sm:gap-3 sm:p-2.5">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="ml-2 h-5 w-5 shrink-0 text-white/60 sm:ml-3" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg>
        <label className="sr-only" htmlFor="directory-search">Search the tools directory</label>
        <input id="directory-search" type="search" value={directory.query} onChange={(event) => directory.setQuery(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent py-3 text-base text-white outline-none placeholder:text-white/50 sm:py-4" />
        {directory.query && <button type="button" onClick={() => directory.setQuery("")} className="shrink-0 px-2 text-sm text-white/70">Clear</button>}
        <Link href="/tools/submit" className="hidden shrink-0 rounded-xl bg-white px-5 py-3.5 text-sm font-medium text-black sm:block">{label}</Link>
      </div>
      <Link href="/tools/submit" className="mt-3 block rounded-xl bg-white px-5 py-3 text-center text-sm font-medium text-black sm:hidden">{label}</Link>
    </div>
  );
}

export function DirectoryLogosBlock({ props }: { props: Record<string, unknown> }) {
  const directory = useDirectory();
  if (!directory?.heroLogos.length) return null;
  return (
    <div aria-hidden="true" className="tool-logo-marquee-viewport relative mt-4" style={{ ...elementStyle(props), overflow: "hidden" }}>
      <div className="tool-logo-marquee gap-4">
        {[...directory.heroLogos, ...directory.heroLogos].map((tool, index) => (
          <span key={`${tool.slug}-${index}`} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 p-2">
            <SafeImage src={tool.logo_url} alt="" width={40} height={40} className="h-9 w-9 object-contain opacity-80" />
          </span>
        ))}
      </div>
    </div>
  );
}

function pageRange(current: number, total: number): (number | null)[] {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const sorted = [...new Set([1, current, total])].sort((a, b) => a - b);
  const output: (number | null)[] = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) output.push(null);
    output.push(value);
  });
  return output;
}

export function DirectoryResultsBlock({ props }: { props: Record<string, unknown> }) {
  const directory = useDirectory();
  const results = useMemo(() => {
    if (!directory) return [];
    const query = directory.query.trim().toLowerCase();
    const filtered = directory.tools.filter((tool) => {
      if (directory.pricing && tool.pricing_type !== directory.pricing) return false;
      if (directory.category && tool.category_slug !== directory.category) return false;
      return !query || [tool.name, tool.tagline, tool.category_name, tool.subcategory].some((part) => part?.toLowerCase().includes(query));
    });
    if (directory.sort === "az") filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (directory.sort === "za") filtered.sort((a, b) => b.name.localeCompare(a.name));
    else if (directory.sort === "newest") filtered.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    else filtered.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.name.localeCompare(b.name));
    return filtered;
  }, [directory]);
  const query = directory?.query;
  const pricing = directory?.pricing;
  const category = directory?.category;
  const sort = directory?.sort;
  const setPage = directory?.setPage;
  useEffect(() => { setPage?.(1); }, [query, pricing, category, sort, setPage]);
  if (!directory) return null;
  const pageCount = Math.max(1, Math.ceil(results.length / PER_PAGE));
  const currentPage = Math.min(directory.page, pageCount);
  const visible = results.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const categoryOptions = [
    { value: "", label: `All categories (${directory.tools.length})` },
    ...directory.categories.filter((item) => item.tool_count > 0).map((item) => ({ value: item.slug, label: `${item.name} (${item.tool_count})` })),
  ];
  const activeCategoryName = directory.categories.find((item) => item.slug === directory.category)?.name;
  const movePage = (value: number) => { directory.setPage(value); document.getElementById("directory-results-top")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return (
    <section style={sectionStyle(props)} id={str(props, "anchor") || undefined}>
      <div className="mx-auto" style={{ maxWidth: number(props, "maxWidth", 1152) || 1152 }}>
        <div id="directory-results-top" className="scroll-mt-24" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <BrandSelect value={directory.category} onChange={directory.setCategory} options={categoryOptions} searchable searchPlaceholder="Search categories…" className="sm:w-64" />
          <BrandSelect value={directory.pricing} onChange={directory.setPricing} options={PRICING_OPTIONS} className="sm:w-44" />
          <BrandSelect value={directory.sort} onChange={directory.setSort} options={SORT_OPTIONS} className="sm:w-44" />
          <p className="text-sm text-ink-soft sm:ml-auto">{results.length} {results.length === 1 ? "tool" : "tools"}{activeCategoryName ? ` in ${activeCategoryName}` : ""}</p>
        </div>
        {results.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center">
            <p className="font-display text-lg font-semibold">{directory.tools.length === 0 ? "The directory is being built right now" : "Nothing matches that yet"}</p>
            <p className="mt-2 text-sm text-ink-soft">{directory.tools.length === 0 ? "Check back soon." : "Try a shorter search, or clear the filters."}</p>
          </div>
        ) : <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((tool) => <DirectoryToolCard key={tool.slug} tool={tool} />)}</div>
          {pageCount > 1 && <nav aria-label="Directory pages" className="mt-10 flex flex-nowrap items-center justify-center gap-1.5 sm:gap-2">
            <button type="button" onClick={() => movePage(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page" className="shrink-0 rounded-full border border-line px-3 py-2 text-sm disabled:opacity-40">←</button>
            {pageRange(currentPage, pageCount).map((entry, index) => entry === null ? <span key={`gap-${index}`} aria-hidden="true">…</span> : <button key={entry} type="button" onClick={() => movePage(entry)} aria-label={`Page ${entry}`} aria-current={entry === currentPage ? "page" : undefined} className={`min-w-9 rounded-full border px-3 py-2 text-sm ${entry === currentPage ? "border-ink bg-ink text-paper" : "border-line"}`}>{entry}</button>)}
            <button type="button" onClick={() => movePage(currentPage + 1)} disabled={currentPage === pageCount} aria-label="Next page" className="shrink-0 rounded-full border border-line px-3 py-2 text-sm disabled:opacity-40">→</button>
          </nav>}
        </>}
      </div>
    </section>
  );
}

export function DirectoryCategoriesBlock({ props }: { props: Record<string, unknown> }) {
  const directory = useDirectory();
  if (!directory) return null;
  return <div style={elementStyle(props)} className="flex flex-wrap gap-2">
    {directory.categories.filter((item) => item.tool_count > 0).map((item) => (
      <Link key={item.slug} href={`/tools/${item.slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm text-ink-soft hover:border-ink hover:text-ink">
        {item.name}<span className="text-xs text-ink-soft/70">{item.tool_count}</span>
      </Link>
    ))}
  </div>;
}
