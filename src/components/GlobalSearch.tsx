"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSearchQuery } from "@/lib/useSearchQuery";

export function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

export function LoadingSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

/** Desktop-only command-palette search (Cmd/Ctrl+K or the header button).
 * On mobile, search lives inline in the hamburger menu instead, see
 * MobileSearch.tsx -- a second trigger button in an already-cramped
 * mobile header wasn't worth it. */
export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const { query, setQuery, results, loading } = useSearchQuery();
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    // Reset keyboard selection whenever the result set changes underneath it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0);
  }, [results]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => {
          if (o) setQuery("");
          return !o;
        });
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
      if (!open || results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        const target = results[activeIndex];
        if (target) {
          e.preventDefault();
          router.push(target.url);
          setOpen(false);
          setQuery("");
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setQuery, open, results, activeIndex, router]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }, [open]);

  // Close modal when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, setQuery]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink md:flex md:h-auto md:w-auto md:gap-2 md:border md:border-line md:px-3 md:py-2 md:hover:border-ink/50"
        aria-label="Search"
      >
        <SearchIcon />
        <span className="hidden text-sm md:block">Search...</span>
        <span className="hidden text-xs text-ink-soft/70 md:block">⌘K</span>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/40 p-4 pt-[10vh] backdrop-blur-sm sm:p-6">
          <div
            ref={modalRef}
            className="w-full max-w-xl overflow-hidden rounded-2xl bg-paper shadow-2xl ring-1 ring-line animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <SearchIcon className="h-5 w-5 text-ink-soft" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the site..."
                className="flex-1 bg-transparent py-2 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none"
              />
              {loading && <LoadingSpinner className="h-4 w-4 text-ink-soft" />}
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-xs font-medium text-ink-soft hover:bg-paper-soft hover:text-ink"
              >
                ESC
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {results.length > 0 ? (
                <ul className="p-2">
                  {results.map((r, i) => (
                    <li key={`${r.url}-${i}`}>
                      <Link
                        href={r.url}
                        onClick={() => setOpen(false)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={`flex flex-col gap-1 rounded-xl px-4 py-3 transition-colors hover:bg-paper-soft focus:bg-paper-soft focus:outline-none ${
                          i === activeIndex ? "bg-paper-soft" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-ink">{r.title}</span>
                          <span className="text-xs uppercase tracking-wider text-ink-soft/70">
                            {r.type}
                          </span>
                        </div>
                        {r.desc && (
                          <span className="line-clamp-1 text-sm text-ink-soft">
                            {r.desc}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : query.trim() && !loading ? (
                <div className="p-8 text-center text-sm text-ink-soft">
                  No results found for &quot;{query}&quot;
                </div>
              ) : !query.trim() ? (
                <div className="p-8 text-center text-sm text-ink-soft">
                  Search public pages, webinars, courses, tools, and more.
                </div>
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
