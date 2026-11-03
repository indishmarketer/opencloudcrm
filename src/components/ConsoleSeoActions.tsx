"use client";

import { useState } from "react";

export default function ConsoleSeoActions() {
  const [purgeStatus, setPurgeStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [purgeMessage, setPurgeMessage] = useState("");
  const [reindexStatus, setReindexStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [reindexMessage, setReindexMessage] = useState("");

  async function handlePurge() {
    setPurgeStatus("running");
    try {
      const res = await fetch("/api/console/purge-cache", { method: "POST" });
      const body = await res.json();
      setPurgeStatus(body.ok ? "done" : "error");
      setPurgeMessage(body.message || "");
    } catch {
      setPurgeStatus("error");
      setPurgeMessage("Request failed.");
    }
  }

  async function handleReindex() {
    setReindexStatus("running");
    try {
      const res = await fetch("/api/console/reindex", { method: "POST" });
      const body = await res.json();
      const googleOk = (body.google || []).filter((r: { ok: boolean }) => r.ok).length;
      setReindexStatus("done");
      if (body.submitted === 0) {
        setReindexMessage(
          `Nothing to submit. All ${body.candidates} pages were already submitted in the last 14 days.`
        );
      } else {
        setReindexMessage(
          `Submitted ${body.submitted} new/stale page(s) (${body.skippedRecent} skipped, already submitted recently). Google: ${googleOk}/${body.submitted} ok. Bing: ${body.bing?.ok ? "ok" : "failed"}.`
        );
      }
    } catch {
      setReindexStatus("error");
      setReindexMessage("Request failed.");
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-semibold">Purge cache</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Clears Cloudflare&apos;s cache so visitors see the latest version of the site right away.
        </p>
        <button
          onClick={handlePurge}
          disabled={purgeStatus === "running"}
          className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {purgeStatus === "running" ? "Purging…" : "Purge cache"}
        </button>
        {purgeStatus === "done" && <p className="mt-2 text-sm text-ink-soft">{purgeMessage}</p>}
        {purgeStatus === "error" && <p className="mt-2 text-sm text-red-600">{purgeMessage}</p>}
      </div>

      <div className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-semibold">Submit for indexing</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Submits new or stale public pages to Google and Bing so they get crawled. Anything
          already submitted in the last 14 days is skipped automatically, to stay well inside
          Google&apos;s usage expectations. Pages marked noindex, like this console, are never
          included.
        </p>
        <button
          onClick={handleReindex}
          disabled={reindexStatus === "running"}
          className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {reindexStatus === "running" ? "Submitting…" : "Submit for indexing"}
        </button>
        {reindexStatus === "done" && <p className="mt-2 text-sm text-ink-soft">{reindexMessage}</p>}
        {reindexStatus === "error" && <p className="mt-2 text-sm text-red-600">{reindexMessage}</p>}
      </div>
    </div>
  );
}
