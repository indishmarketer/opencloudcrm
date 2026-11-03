"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { slug: string; name: string };

/** A single-row, type-to-filter category picker, replacing a wrapping row
 * of pill links (which turns into several messy rows on mobile once
 * there are more than 3-4 categories, and only gets worse as more get
 * added). Defaults to "All" selected. Typing filters the option list,
 * picking one navigates -- each category still gets its own indexed page,
 * this is just a cleaner way to get there. */
export default function CategorySelect({
  options,
  allLabel,
  allHref,
  basePath,
  active,
}: {
  options: Option[];
  allLabel: string;
  allHref: string;
  basePath: string;
  /** slug of the currently active category, if any (omit on the "all" page) */
  active?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeLabel = active ? options.find((o) => o.slug === active)?.name || allLabel : allLabel;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function select(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div ref={ref} className="relative w-full sm:w-72">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-paper px-4 py-2.5 text-left text-sm outline-none transition-colors focus:border-ink ${
          open ? "border-ink" : "border-line"
        }`}
      >
        <span className="truncate">{activeLabel}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-paper shadow-lg">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to filter..."
            className="w-full border-b border-line bg-paper px-4 py-2.5 text-sm outline-none placeholder:text-ink-soft/70"
          />
          <div className="max-h-64 overflow-y-auto">
            {!query.trim() && (
              <button
                type="button"
                onClick={() => select(allHref)}
                className={`block w-full whitespace-nowrap px-4 py-2.5 text-left text-sm hover:bg-paper-soft ${
                  !active ? "bg-paper-soft font-medium" : ""
                }`}
              >
                {allLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-soft">No matching categories.</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.slug}
                  type="button"
                  onClick={() => select(`${basePath}/${o.slug}`)}
                  className={`block w-full whitespace-nowrap px-4 py-2.5 text-left text-sm hover:bg-paper-soft ${
                    active === o.slug ? "bg-paper-soft font-medium" : ""
                  }`}
                >
                  {o.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
