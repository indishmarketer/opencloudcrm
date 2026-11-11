"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PageOption = { path: string; title: string; status: string };

/** A destination field that is both a page picker and a plain URL box.
 *
 * Typing "/" (or any part of a page's name or address) lists this site's own
 * pages to choose from; typing anything else -- an external https:// link --
 * is kept exactly as entered. Before this, the redirect destination was a
 * bare text input, so getting a visitor to an existing thank-you page meant
 * remembering and retyping its exact path. */
export default function PageUrlPicker({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [pages, setPages] = useState<PageOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/pages")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: { pages?: { path?: string; title?: string; status?: string }[] }) => {
        if (cancelled) return;
        setPages(
          (body.pages || [])
            .filter((p): p is { path: string; title?: string; status?: string } => typeof p.path === "string" && !!p.path)
            .map((p) => ({ path: p.path, title: p.title || p.path, status: p.status || "draft" })),
        );
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // An external URL should never be read as a search term for internal pages.
  const isExternal = /^https?:\/\//i.test(value.trim());
  const matches = useMemo(() => {
    if (isExternal) return [];
    const q = value.trim().toLowerCase();
    const all = [...pages].sort((a, b) => a.path.localeCompare(b.path));
    if (!q || q === "/") return all.slice(0, 50);
    return all
      .filter((p) => p.path.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))
      .slice(0, 50);
  }, [pages, value, isExternal]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        placeholder={placeholder || "/thank-you or https://example.com/thanks"}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className={className}
      />
      {open && !isExternal && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-white shadow-xl">
          {!loaded ? (
            <p className="px-3 py-2 text-xs text-ink-soft">Loading pages…</p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink-soft">
              No page matches that. Whatever you type is used as-is, so an external link is fine.
            </p>
          ) : (
            matches.map((page) => (
              <button
                key={page.path}
                type="button"
                onClick={() => {
                  onChange(page.path);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-paper-soft ${
                  page.path === value ? "bg-stone-100 font-semibold text-ink" : "text-ink"
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{page.title}</span>
                  {page.status !== "published" && (
                    <span
                      title="This page is not published, so visitors sent here would not see it"
                      className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[9px] font-semibold uppercase text-amber-900"
                    >
                      Draft
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-soft">{page.path}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
