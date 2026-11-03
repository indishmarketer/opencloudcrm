"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AnchoredPopover from "@/components/AnchoredPopover";

type Option = { value: string; label: string };

/** Above this many options, scrolling to find one is slower than typing
 * three letters, so the filter box appears on its own. `searchable` forces
 * it either way. */
const SEARCH_THRESHOLD = 10;

/** Native <select> dropdown lists can't be styled cross-browser -- the open
 * list renders with the OS's own colors (that blue highlight on Windows),
 * off-brand no matter what CSS is applied to the closed control. This is a
 * fully custom listbox so every part of it -- closed state, open panel,
 * hover/selected rows -- matches the site's actual design system.
 *
 * The open list is positioned by AnchoredPopover rather than absolutely
 * below the control: an absolute panel opened below the fold when the
 * control sat near the bottom of a page or a dialog, and `min-w-max` let a
 * long option run off the side of a phone screen.
 *
 * **It filters itself once the list is long.** The tools directory now has
 * dozens of categories, and a plain scrolling list of those is unusable on
 * a phone -- the owner hit this picking a category while submitting a tool.
 * Past `SEARCH_THRESHOLD` options a filter box appears at the top of the
 * panel and takes focus, so the common case is type-two-letters-and-Enter.
 */
export default function BrandSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  compact,
  wrapOptions,
  searchable,
  searchPlaceholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  /** Smaller padding/font for tight inline contexts like a table row. */
  compact?: boolean;
  /** Wraps long option labels (e.g. blog post titles) instead of the
   * default nowrap-and-size-to-longest-option behavior, which is right
   * for short uniform options (email addresses) but blows out the panel
   * width for anything longer. */
  wrapOptions?: boolean;
  /** Force the filter box on or off. Left undefined it appears once there
   * are more than ten options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const showSearch = searchable ?? options.length > SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (open && showSearch) searchInput.current?.focus();
  }, [open, showSearch]);

  const selected = options.find((o) => o.value === value);
  const sizeClasses = compact ? "px-2 py-1 text-xs" : "px-4 py-2.5 text-sm";

  function pick(next: string) {
    onChange(next);
    close();
  }

  return (
    <div className={`relative ${className || ""}`}>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-paper text-left outline-none transition-colors focus:border-ink disabled:opacity-50 ${sizeClasses} ${
          open ? "border-ink" : ""
        }`}
      >
        <span className="truncate">{selected ? selected.label : placeholder || "Select…"}</span>
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
      <AnchoredPopover
        anchor={trigger}
        open={open}
        onClose={close}
        width="anchor"
        align="start"
        className="rounded-lg p-0"
      >
        {showSearch && (
          <div className="sticky top-0 z-10 bg-paper">
            <input
              ref={searchInput}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Enter picks the only remaining match, which is what
                // typing a filter is for.
                if (event.key === "Enter" && filtered.length > 0) {
                  event.preventDefault();
                  pick(filtered[0].value);
                }
              }}
              placeholder={searchPlaceholder || "Type to filter…"}
              className="w-full border-b border-line bg-paper px-4 py-2.5 text-sm outline-none placeholder:text-ink-soft/70"
            />
          </div>
        )}
        {filtered.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-soft">No matches.</p>
        ) : (
          filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-paper-soft ${wrapOptions ? "" : "whitespace-nowrap"} ${
                o.value === value ? "bg-paper-soft font-medium" : ""
              }`}
            >
              {o.label}
            </button>
          ))
        )}
      </AnchoredPopover>
    </div>
  );
}
