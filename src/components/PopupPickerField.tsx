"use client";

import { useEffect, useState } from "react";
import BrandSelect from "@/components/BrandSelect";

/** Chooses a designed popup, and makes one when there are none.
 *
 * The "+ New" button is the point: with no popups yet, a plain dropdown is
 * a dead end -- you would have to know to leave the page, find Popups,
 * create one and come back. It creates the popup, selects it straight away,
 * and opens its editor in a new tab.
 *
 * Its own file (rather than living inside PageBlockFields.tsx, where it
 * started) so it can be reused from RichTextEditor.tsx too -- that file is
 * imported BY PageBlockFields.tsx, so the reverse import would be circular. */
export default function PopupPickerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [popups, setPopups] = useState<{ id: number; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function fetchPopups(): Promise<{ id: number; name: string }[]> {
    const res = await fetch("/api/console/popups").catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    return Array.isArray(body.popups)
      ? body.popups.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name }))
      : [];
  }

  useEffect(() => {
    // Deferred so the fetch's setState lands in its own tick rather than
    // synchronously inside the effect.
    let cancelled = false;
    void (async () => {
      const list = await fetchPopups();
      if (!cancelled) setPopups(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createPopup() {
    setBusy(true);
    const res = await fetch("/api/console/popups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New popup" }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setBusy(false);
    if (!res?.ok || !body.popup?.id) return;
    setPopups(await fetchPopups());
    onChange(String(body.popup.id));
    window.open(`/console/popups/${body.popup.id}`, "_blank", "noopener");
  }

  if (popups === null) return <p className="text-sm text-ink-soft">Loading popups…</p>;
  return (
    <div className="space-y-2">
      {popups.length > 0 && (
        <BrandSelect
          value={value}
          onChange={onChange}
          options={[{ value: "", label: "Choose a popup…" }, ...popups.map((p) => ({ value: String(p.id), label: p.name }))]}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void createPopup()}
          disabled={busy}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          {busy ? "Creating…" : "+ New popup"}
        </button>
        {value && (
          <a
            href={`/console/popups/${value}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink"
          >
            Edit this popup
          </a>
        )}
      </div>
      {popups.length === 0 && (
        <p className="text-xs text-ink-soft">No popups yet. Create one and design it with the same elements you use on a page.</p>
      )}
    </div>
  );
}
