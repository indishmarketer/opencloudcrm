"use client";

import { useEffect, useState } from "react";
import { cleanSourceLabel, MAX_SOURCE_WORDS } from "@/lib/pageSourcesShape";

/** The contact source for one public page, saved on its own (separate from
 * the editor's Save). Anyone who first becomes a contact on this page --
 * through a form, popup, signup, booking or anything else -- is labelled
 * with it in Contacts. */
export default function PageSourceField({ path, compact = false }: { path: string | null; compact?: boolean }) {
  const [saved, setSaved] = useState("");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    fetch(`/api/console/page-sources?path=${encodeURIComponent(path)}`).then((r) => r.json()).then((body) => {
      if (cancelled) return;
      setSaved(body.label || ""); setValue(body.label || ""); setStatus("idle");
    }).catch(() => !cancelled && setStatus("idle"));
    return () => { cancelled = true; };
  }, [path]);

  if (!path) return <p className="text-xs text-ink-soft">Publish this page first to give it a contact source.</p>;
  const tooLong = cleanSourceLabel(value) === null;

  async function save() {
    setStatus("saving"); setError("");
    const res = await fetch("/api/console/page-sources", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, label: value }) }).catch(() => null);
    const body = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setStatus("error"); setError(body.error || "Could not save."); return; }
    setSaved(body.label); setValue(body.label); setStatus("saved");
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="grid gap-1.5 text-sm font-medium">
      {!compact && <span>Contact source</span>}
      <div className="flex gap-2">
        <input value={value} disabled={status === "loading"} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!tooLong && value !== saved) void save(); } }} placeholder="e.g. Newsletter page" aria-label={`Contact source for ${path}`} className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm font-normal outline-none focus:border-ink" />
        <button type="button" onClick={() => void save()} disabled={tooLong || value.trim() === saved || status === "saving" || status === "loading"} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium hover:border-ink disabled:opacity-50">{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save"}</button>
      </div>
      <span className={`text-xs font-normal ${tooLong || status === "error" ? "text-red-700" : "text-ink-soft"}`}>
        {tooLong ? `Use ${MAX_SOURCE_WORDS} words or fewer.` : status === "error" ? error : `Up to ${MAX_SOURCE_WORDS} words. New contacts who sign up on ${path} show this in Contacts. It replaces a form's own source when the form is on this page.`}
      </span>
    </div>
  );
}
