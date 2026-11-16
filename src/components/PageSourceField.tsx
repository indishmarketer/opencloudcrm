"use client";

import { useEffect, useState } from "react";
import { cleanSourceLabel, MAX_SOURCE_WORDS } from "@/lib/pageSourcesShape";

/** Load a page's saved contact source. */
export async function loadPageSource(path: string): Promise<string> {
  const res = await fetch(`/api/console/page-sources?path=${encodeURIComponent(path)}`).catch(() => null);
  const body = await res?.json().catch(() => ({})) || {};
  return typeof body.label === "string" ? body.label : "";
}

/** Save a page's contact source. Called by the surrounding form's own Save,
 * so the field never needs a button of its own. Throws on failure. */
export async function savePageSource(path: string, label: string): Promise<void> {
  const res = await fetch("/api/console/page-sources", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, label }) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not save the contact source.");
  }
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
  const tooLong = cleanSourceLabel(value) === null;
  return (
    <div className="grid gap-1.5 text-sm font-medium">
      {!compact && <span>Contact source</span>}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Newsletter page" aria-label="Contact source" className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm font-normal outline-none focus:border-ink" />
      <span className={`text-xs font-normal ${tooLong ? "text-red-700" : "text-ink-soft"}`}>
        {tooLong ? `Use ${MAX_SOURCE_WORDS} words or fewer.` : `Up to ${MAX_SOURCE_WORDS} words. New contacts who sign up${path ? ` on ${path}` : " on this page"} show this in Contacts. It replaces a form's own source when the form is on this page.`}
      </span>
    </div>
  );
}

/** State for a form that holds a page source: the current value, whether
 * it changed, and save(), which the form's Save calls (no-op if unchanged). */
export function usePageSource(path: string | null) {
  const [saved, setSaved] = useState("");
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!path) { setSaved(""); setValue(""); return; }
    let cancelled = false;
    void loadPageSource(path).then((label) => { if (!cancelled) { setSaved(label); setValue(label); } });
    return () => { cancelled = true; };
  }, [path]);
  const dirty = value.trim() !== saved;
  async function save(atPath: string | null = path) {
    if (!atPath || !dirty) return;
    const clean = cleanSourceLabel(value);
    if (clean === null) throw new Error(`Keep the contact source to ${MAX_SOURCE_WORDS} words or fewer.`);
    await savePageSource(atPath, clean);
    setSaved(clean);
    setValue(clean);
  }
  return { value, setValue, dirty, save };
}
