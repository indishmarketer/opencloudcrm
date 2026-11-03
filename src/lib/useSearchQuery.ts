"use client";

import { useEffect, useState } from "react";

export type SearchResult = { type: string; title: string; desc: string | null; url: string };

/** Shared debounced-search state, used by both the desktop command-palette
 * modal and the inline mobile search box, so the fetch/debounce/abort
 * logic (and the empty-query reset) only exists in one place. */
export function useSearchQuery() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      // Clear results synchronously when query is emptied so stale results don't linger.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Search error:", err);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query]);

  return { query, setQuery, results, loading };
}
