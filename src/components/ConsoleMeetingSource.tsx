"use client";

import { useState } from "react";
import PageSourceField, { usePageSource } from "@/components/PageSourceField";
import { MEETING_SOURCE_PATH } from "@/lib/pageSourcesShape";

/** Meetings → Source: the one contact source for every booking. */
export default function ConsoleMeetingSource() {
  const source = usePageSource(MEETING_SOURCE_PATH);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  async function save() {
    setStatus("saving"); setError("");
    try { await source.save(); setStatus("saved"); setTimeout(() => setStatus("idle"), 2000); }
    catch (saveError) { setStatus("idle"); setError(saveError instanceof Error ? saveError.message : "Could not save."); }
  }

  return (
    <div className="space-y-4">
      <PageSourceField path={null} value={source.value} onChange={source.setValue} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="button" onClick={() => void save()} disabled={!source.dirty || status === "saving"} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50">{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save"}</button>
    </div>
  );
}
