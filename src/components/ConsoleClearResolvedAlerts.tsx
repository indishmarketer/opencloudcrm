"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

/** Permanently removes every resolved alert from the database -- the
 * "Mark done" button only stops it showing as open, it stays on file
 * indefinitely (until the daily cron's 30-day sweep) unless cleared here. */
export default function ConsoleClearResolvedAlerts() {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function clear() {
    const ok = await confirm({
      message: "Permanently delete every resolved alert? This can't be undone.",
      confirmLabel: "Clear",
    });
    if (!ok) return;

    setBusy(true);
    setError("");
    const res = await fetch("/api/console/alerts/clear-resolved", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Could not clear those. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      {dialog}
      <button
        type="button"
        onClick={clear}
        disabled={busy}
        className="rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
      >
        {busy ? "Clearing..." : "Clear"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </>
  );
}
