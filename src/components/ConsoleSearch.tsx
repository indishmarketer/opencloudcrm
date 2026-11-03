"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SearchResult = { title: string; href: string; section: string; detail?: string };
type NavGroup = { title: string; links: { href: string; label: string; badge?: number }[] };

function buildDestinations(groups: NavGroup[]): SearchResult[] {
  return groups.flatMap((group) =>
    group.links.map((link) => ({ title: link.label, href: link.href, section: group.title }))
  );
}

function SearchGlyph() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" strokeLinecap="round" /></svg>;
}

export default function ConsoleSearch({ compact = false, groups }: { compact?: boolean; groups: NavGroup[] }) {
  const DESTINATIONS = useMemo(() => buildDestinations(groups), [groups]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  // Resets the highlighted result whenever the query or result count
  // changes, without a useEffect render-after-render roundtrip -- setState
  // during render itself is React's documented pattern for "adjust state
  // when a dependent value changes" (https://react.dev/learn/you-might-not-need-an-effect).
  const [resetKey, setResetKey] = useState("");
  const nextResetKey = `${query}:${records.length}`;
  if (resetKey !== nextResetKey) {
    setResetKey(nextResetKey);
    setActive(0);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const destinations = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return DESTINATIONS.slice(0, 8);
    return DESTINATIONS.filter((item) => `${item.title} ${item.section} ${item.detail || ""}`.toLocaleLowerCase().includes(q));
  }, [query, DESTINATIONS]);
  const results = useMemo(() => {
    const unique = new Map<string, SearchResult>();
    for (const item of [...destinations, ...records]) {
      const key = `${item.href}:${item.title}`;
      if (!unique.has(key)) unique.set(key, item);
    }
    return [...unique.values()].slice(0, 18);
  }, [destinations, records]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears results from a closed/too-short query; part of the same debounced fetch below
      setRecords([]);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch(`/api/console/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search unavailable");
        const body = await response.json() as { results?: SearchResult[] };
        setRecords(body.results || []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRecords([]);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
      } else if (open && event.key === "ArrowDown" && results.length) {
        event.preventDefault();
        setActive((value) => Math.min(value + 1, results.length - 1));
      } else if (open && event.key === "ArrowUp" && results.length) {
        event.preventDefault();
        setActive((value) => Math.max(value - 1, 0));
      } else if (open && event.key === "Enter" && results[active]) {
        event.preventDefault();
        router.push(results[active].href);
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, open, results, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        title="Search (Ctrl+K)"
        className={`flex h-10 items-center rounded-lg border border-line bg-paper font-body text-sm text-ink-soft transition-colors hover:border-ink/40 hover:bg-paper-soft ${compact ? "w-10 justify-center" : "w-full gap-2.5 px-3"}`}
      >
        <SearchGlyph />
        {!compact && <><span className="flex-1 text-left">Search</span><kbd className="font-body text-[11px] text-ink-soft/70">Ctrl K</kbd></>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-ink/35 px-4 pt-[8vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <SearchGlyph />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages, contacts, templates, drafts..."
                className="min-w-0 flex-1 bg-transparent font-body text-base outline-none placeholder:text-ink-soft/65"
                aria-label="Search"
              />
              {busy && <span className="text-xs text-ink-soft">Searching…</span>}
              <button type="button" onClick={() => setOpen(false)} className="rounded border border-line px-2 py-1 text-[11px] text-ink-soft">ESC</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-2">
              {results.length ? (
                <ul>
                  {results.map((item, index) => (
                    <li key={`${item.href}:${item.title}:${index}`}>
                      <Link href={item.href} onClick={() => setOpen(false)} onMouseEnter={() => setActive(index)} className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 ${active === index ? "bg-paper-soft" : "hover:bg-paper-soft"}`}>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                          {item.detail && <span className="mt-0.5 block truncate text-xs text-ink-soft">{item.detail}</span>}
                        </span>
                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-soft">{item.section}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : query.trim().length > 1 && !busy ? (
                <p className="p-8 text-center text-sm text-ink-soft">No console results for “{query.trim()}”.</p>
              ) : (
                <p className="p-8 text-center text-sm text-ink-soft">Search pages and records. Use ↑ ↓ and Enter to open a result.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
