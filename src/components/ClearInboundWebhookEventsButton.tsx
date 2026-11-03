"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

/** Clears the inbound webhook event log. Only the log rows are deleted --
 * contacts already created from them (via recordContactActivity) are a
 * separate table and are never touched here. */
export default function ClearInboundWebhookEventsButton({ count }: { count: number }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (count === 0) return null;

  async function handleClear() {
    const ok = await confirm({
      message: `Permanently delete all ${count} logged inbound event${count === 1 ? "" : "s"}? This only clears this log -- any contacts already created from them are not affected.`,
      confirmLabel: "Clear all",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/console/webhooks/events", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setError("Could not clear events.");
      return;
    }
    router.push("/console/integrations?tab=inbound");
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={handleClear}
        disabled={busy}
        className="rounded-full border border-red-600 px-4 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
      >
        {busy ? "Clearing..." : "Clear all"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {dialog}
    </div>
  );
}
