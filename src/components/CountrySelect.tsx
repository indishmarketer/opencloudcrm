"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { countryOptions, isIndianTimeZone, normalizeCountry } from "@/lib/countries";

let detected: Promise<string | null> | null = null;

/** Best guess at the visitor's country for prefilling the picker: an Indian
 * device clock first (a VPN doesn't change it), then Cloudflare's IP
 * lookup. Fetched once per page load. */
export function detectCountry(): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  if (isIndianTimeZone(timeZone)) return Promise.resolve("IN");
  detected ??= fetch("/api/geo", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => normalizeCountry(body?.country))
    .catch(() => null);
  return detected;
}

/** Searchable country dropdown in the site's own style (a native select's
 * open list can't be styled). Prefills from detectCountry() when empty.
 * With `name`, a hidden input carries the code for plain form posts. */
export default function CountrySelect({
  value,
  onChange,
  id,
  name,
  autoDetect = true,
  disabled,
  pill = false,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  name?: string;
  autoDetect?: boolean;
  disabled?: boolean;
  /** Rounded-full, to sit in a row of pill inputs. */
  pill?: boolean;
  className?: string;
}) {
  const options = useMemo(() => countryOptions(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!autoDetect || valueRef.current) return;
    let cancelled = false;
    void detectCountry().then((code) => {
      if (!cancelled && code && !valueRef.current) onChangeRef.current(code);
    });
    return () => {
      cancelled = true;
    };
  }, [autoDetect]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase() === q);
  }, [options, query]);

  const selected = options.find((o) => o.value === value);

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  function openList() {
    setOpen(true);
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openList())}
        className={`flex w-full items-center justify-between gap-2 border bg-paper px-4 py-3 text-left text-sm text-ink outline-none ${pill ? "rounded-full" : "rounded-lg"} transition-colors focus:border-ink disabled:opacity-50 ${
          open ? "border-ink" : "border-line"
        }`}
      >
        <span className={`truncate ${selected ? "" : "text-ink-soft"}`}>{selected ? selected.label : "Select your country"}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-56 rounded-lg border border-line bg-paper text-ink shadow-lg">
          <input
            ref={searchRef}
            type="text"
            value={query}
            role="combobox"
            aria-controls={listId}
            aria-expanded="true"
            aria-label="Search countries"
            placeholder="Search…"
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const pick = filtered[active];
                if (pick) choose(pick.value);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }
            }}
            className="w-full rounded-t-lg border-b border-line bg-paper px-4 py-2.5 text-sm outline-none"
          />
          <ul id={listId} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-4 py-2.5 text-sm text-ink-soft">No match</li>}
            {filtered.map((o, i) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={`block w-full px-4 py-2 text-left text-sm ${i === active ? "bg-paper-soft" : ""} ${
                    o.value === value ? "font-medium" : ""
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
