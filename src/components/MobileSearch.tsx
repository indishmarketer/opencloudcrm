"use client";

import Link from "next/link";
import { useSearchQuery } from "@/lib/useSearchQuery";
import { SearchIcon, LoadingSpinner } from "@/components/GlobalSearch";

/** Search box shown first inside the mobile hamburger panel, before any
 * menu links -- mobile has no room for a separate search trigger plus the
 * "Get in touch" button in the header, so search moved in here instead. */
export default function MobileSearch({ onNavigate }: { onNavigate: () => void }) {
  const { query, setQuery, results, loading } = useSearchQuery();

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5">
        <SearchIcon className="h-4 w-4 text-ink-soft" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the site..."
          className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-soft/70 focus:outline-none"
        />
        {loading && <LoadingSpinner className="h-4 w-4 text-ink-soft" />}
      </div>

      {query.trim() && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-line">
          {results.length > 0 ? (
            results.map((r, i) => (
              <Link
                key={`${r.url}-${i}`}
                href={r.url}
                onClick={onNavigate}
                className="block border-b border-line px-3 py-2.5 last:border-0 hover:bg-paper-soft"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{r.title}</span>
                  <span className="shrink-0 text-xs uppercase tracking-wide text-ink-soft/70">
                    {r.type}
                  </span>
                </div>
                {r.desc && <p className="mt-0.5 line-clamp-1 text-xs text-ink-soft">{r.desc}</p>}
              </Link>
            ))
          ) : !loading ? (
            <p className="px-3 py-3 text-sm text-ink-soft">No results found for &quot;{query}&quot;</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
