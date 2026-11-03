"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LIBRARY_LAST_BROWSE_URL_KEY } from "@/components/LibraryBackLink";

type Category = { id: number; slug: string; name: string };
type LibraryItem = {
  slug: string;
  title: string;
  description: string | null;
  category_slug: string;
  category_name: string;
  type: "prompt" | "skill";
  // Not displayed in the grid, only searched -- prompts carry prompt_text,
  // skills carry skill_markdown, never both.
  prompt_text?: string;
  skill_markdown?: string;
};
type Guide = {
  slug: string;
  title: string;
  description: string | null;
  item_count: number;
  body?: string;
};

const TABS = [
  { key: "prompt", label: "Prompts" },
  { key: "skill", label: "Skills" },
  { key: "guide", label: "Guides" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | null): value is TabKey {
  return value === "prompt" || value === "skill" || value === "guide";
}

/** Tab/category/search all live in the URL (not just React state) so that
 * clicking into a prompt/skill/guide and then hitting back returns to the
 * exact same tab and filters instead of remounting this page fresh on the
 * default "Prompts" tab -- state-only tabs don't survive a real navigation
 * away and back. */
export default function PromptLibraryBrowser({
  categories,
  items,
  guides,
}: {
  categories: Category[];
  items: LibraryItem[];
  guides: Guide[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab: TabKey = isTabKey(tabParam) ? tabParam : "prompt";
  const categorySlug = searchParams.get("cat") || "all";
  const [query, setQuery] = useState(searchParams.get("q") || "");

  function updateUrl(next: { tab?: TabKey; cat?: string; q?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.tab !== undefined) params.set("tab", next.tab);
    if (next.cat !== undefined) {
      if (next.cat === "all") params.delete("cat");
      else params.set("cat", next.cat);
    }
    if (next.q !== undefined) {
      if (!next.q) params.delete("q");
      else params.set("q", next.q);
    }
    const url = `/resources/prompt-skill-library/browse?${params.toString()}`;
    router.replace(url, { scroll: false });
    sessionStorage.setItem(LIBRARY_LAST_BROWSE_URL_KEY, url);
  }

  // Record the URL this page was actually loaded with too (e.g. a shared
  // deep link with ?tab=guide already in it, or the plain default), so the
  // back-link has something to return to even before any filter is touched.
  useEffect(() => {
    sessionStorage.setItem(LIBRARY_LAST_BROWSE_URL_KEY, `/resources/prompt-skill-library/browse?${searchParams.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setTab(t: TabKey) {
    updateUrl({ tab: t });
  }
  function setCategorySlug(c: string) {
    updateUrl({ cat: c });
  }
  function handleQueryChange(q: string) {
    setQuery(q);
    updateUrl({ q });
  }

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (item.type !== tab) return false;
      if (categorySlug !== "all" && item.category_slug !== categorySlug) return false;
      if (!q) return true;
      const content = item.prompt_text || item.skill_markdown || "";
      return (
        item.title.toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q) ||
        content.toLowerCase().includes(q)
      );
    });
  }, [items, query, categorySlug, tab]);

  const filteredGuides = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guides;
    return guides.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        (g.description || "").toLowerCase().includes(q) ||
        (g.body || "").toLowerCase().includes(q)
    );
  }, [guides, query]);

  return (
    <div>
      <div className="flex gap-2 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={tab === "guide" ? "Search guides…" : `Search ${tab === "prompt" ? "prompts" : "skills"}…`}
          className="w-full max-w-xs rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>

      {tab !== "guide" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setCategorySlug("all")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              categorySlug === "all" ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink"
            }`}
          >
            All categories
          </button>
          {categories.map((c) => (
            <button
              key={c.slug}
              onClick={() => setCategorySlug(c.slug)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                categorySlug === c.slug ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {tab === "guide" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGuides.map((g) => (
            <Link
              key={g.slug}
              href={`/resources/prompt-skill-library/guides/${g.slug}`}
              className="flex flex-col rounded-2xl border border-line p-5 transition-colors hover:border-ink"
            >
              <span className="mb-2 w-fit rounded-full bg-paper-soft px-2 py-0.5 text-xs font-medium text-ink-soft">
                {g.item_count} step{g.item_count === 1 ? "" : "s"}
              </span>
              <p className="font-display text-base font-semibold">{g.title}</p>
              {g.description && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{g.description}</p>}
            </Link>
          ))}
          {filteredGuides.length === 0 && (
            <p className="text-sm text-ink-soft">
              {guides.length === 0 ? "No guides published yet. Check back soon." : "No guides match your search."}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <Link
              key={item.slug}
              href={`/resources/prompt-skill-library/browse/${tab === "prompt" ? "prompts" : "skills"}/${item.slug}`}
              className="flex flex-col rounded-2xl border border-line p-5 transition-colors hover:border-ink"
            >
              <span className="mb-2 w-fit rounded-full bg-paper-soft px-2 py-0.5 text-xs font-medium text-ink-soft">
                {item.category_name}
              </span>
              <p className="font-display text-base font-semibold">{item.title}</p>
              {item.description && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{item.description}</p>}
            </Link>
          ))}
          {filteredItems.length === 0 && (
            <p className="text-sm text-ink-soft">
              {items.filter((i) => i.type === tab).length === 0
                ? `Nothing published in ${tab === "prompt" ? "prompts" : "skills"} yet. Check back soon.`
                : "Nothing matches your search."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
