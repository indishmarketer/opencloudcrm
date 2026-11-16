"use client";

import { useState } from "react";
import { MAX_SOURCE_WORDS, cleanSourceLabel } from "@/lib/pageSourcesShape";

type Source = { label: string; path: string | null };

/** The contact's sources on their own page: each opens the page it came
 * from; the owner can add or remove one. */
export default function ContactSourcesEditor({ contactId, initialSources }: { contactId: number; initialSources: Source[] }) {
  const [sources, setSources] = useState(initialSources);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const tag = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs font-normal text-ink-soft";

  async function call(method: "POST" | "DELETE", value: string) {
    setError("");
    const url = `/api/console/contacts/${contactId}/sources${method === "DELETE" ? `?label=${encodeURIComponent(value)}` : ""}`;
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ label: value }) : undefined }).catch(() => null);
    const body = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setError(body.error || "Could not update the source."); return false; }
    setSources(body.sources);
    return true;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1">
        {!sources.length && <span className={tag}>Unknown</span>}
        {sources.map((source) => (
          <span key={source.label} className={tag}>
            {source.path ? <a href={source.path} target="_blank" rel="noreferrer" title={`Opens ${source.path}`} className="hover:text-ink">{source.label}</a> : source.label}
            <button type="button" onClick={() => void call("DELETE", source.label)} aria-label={`Remove source ${source.label}`} className="text-ink-soft hover:text-red-700">×</button>
          </span>
        ))}
        {!adding && <button type="button" onClick={() => setAdding(true)} className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs font-normal text-ink-soft hover:border-ink hover:text-ink">+ Add</button>}
      </div>
      {adding && (
        <div className="flex gap-1.5">
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter" && cleanSourceLabel(label)) { if (await call("POST", label)) { setLabel(""); setAdding(false); } } if (e.key === "Escape") setAdding(false); }} placeholder={`Up to ${MAX_SOURCE_WORDS} words`} className="w-36 rounded-full border border-line px-3 py-1 text-xs font-normal outline-none focus:border-ink" />
          <button type="button" disabled={!cleanSourceLabel(label)} onClick={async () => { if (await call("POST", label)) { setLabel(""); setAdding(false); } }} className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper disabled:opacity-50">Add</button>
        </div>
      )}
      {error && <p className="text-xs font-normal text-red-700">{error}</p>}
    </div>
  );
}
