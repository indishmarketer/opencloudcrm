"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AnchoredPopover from "@/components/AnchoredPopover";
import type { WhatsAppVariableSource } from "@/lib/whatsappVariableMappings";

export default function WhatsAppVariableSourcePicker({
  value,
  sources,
  onChange,
}: {
  value: string;
  sources: WhatsAppVariableSource[];
  onChange: (source: WhatsAppVariableSource | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const anchor = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const selected = sources.find((source) => source.key === value);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term
      ? sources.filter((source) => `${source.group} ${source.label}`.toLowerCase().includes(term))
      : sources;
  }, [query, sources]);
  const groups = useMemo(() => [...new Set(filtered.map((source) => source.group))], [filtered]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (open) searchInput.current?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border bg-paper px-3 py-2.5 text-left text-sm outline-none transition-colors focus:border-ink ${open ? "border-ink" : "border-line"}`}
      >
        <span className={selected ? "truncate text-ink" : "truncate text-ink-soft"}>
          {selected?.label || "Choose a CRM field, resource, or custom value…"}
        </span>
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <AnchoredPopover
        anchor={anchor}
        open={open}
        onClose={close}
        width={520}
        align="start"
        className="rounded-xl p-0"
      >
        <div className="sticky top-0 z-10 border-b border-line bg-paper p-2">
          <label className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 focus-within:border-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-soft" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="10.8" cy="10.8" r="6.3" />
              <path d="m15.5 15.5 4.2 4.2" strokeLinecap="round" />
            </svg>
            <input
              ref={searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && filtered.length === 1) {
                  event.preventDefault();
                  onChange(filtered[0]);
                  close();
                }
              }}
              placeholder="Search contact fields and content…"
              aria-label="Search variable sources"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-ink-soft/70"
            />
          </label>
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-5 text-sm text-ink-soft">No matching fields or content.</p>
        ) : (
          <div role="listbox" aria-label="Available template variable sources">
            {groups.map((group) => (
              <div key={group} className="py-1">
                <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{group}</p>
                {filtered.filter((source) => source.group === group).map((source) => (
                  <button
                    key={source.key}
                    type="button"
                    role="option"
                    aria-selected={source.key === value}
                    onClick={() => {
                      onChange(source);
                      close();
                    }}
                    className={`block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-paper-soft focus-visible:bg-paper-soft focus-visible:outline-none ${source.key === value ? "bg-paper-soft font-medium text-ink" : "text-ink"}`}
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </AnchoredPopover>
    </>
  );
}
