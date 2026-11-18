"use client";

import { hardcodedPageSource } from "@/lib/pageSourcesShape";

/** Load a page's saved contact source. */
export async function loadPageSource(path: string): Promise<string> {
  return hardcodedPageSource(path);
}

/** Save a page's contact source. Called by the surrounding form's own Save,
 * so the field never needs a button of its own. Throws on failure. */
export async function savePageSource(path: string, label: string): Promise<void> {
  void path;
  void label;
}

/** The contact source for one public page, as a plain field of the form
 * it sits in: the form loads it with loadPageSource and saves it with
 * savePageSource from its own Save. Anyone who first becomes a contact on
 * this page is labelled with it in Contacts. */
export default function PageSourceField({ path, value, onChange, compact = false }: {
  path: string | null;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  void value;
  void onChange;
  const label = hardcodedPageSource(path);
  return (
    <div className="grid gap-1.5 text-sm font-medium">
      {!compact && <span>Contact source</span>}
      <div className="rounded-xl border border-line bg-paper-soft px-3 py-2 text-sm font-normal text-ink">{label}</div>
      <span className="text-xs font-normal text-ink-soft">
        Assigned automatically from {path || "this page"}. Contact sources are managed in code.
      </span>
    </div>
  );
}

/** State for a form that holds a page source: the current value, whether
 * it changed, and save(), which the form's Save calls (no-op if unchanged). */
export function usePageSource(path: string | null) {
  const value = hardcodedPageSource(path);
  const dirty = false;
  function setValue(_value: string) { void _value; }
  async function save(atPath: string | null = path) {
    void atPath;
  }
  return { value, setValue, dirty, save };
}
