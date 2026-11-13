"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

const button =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink disabled:opacity-50";
const primaryButton =
  "inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-60";
const pillDanger =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-600 disabled:opacity-50";

export type PopupRow = { id: number; name: string; elements: number; updatedAt: string };

export default function ConsolePopups({ popups }: { popups: PopupRow[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function createPopup() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/console/popups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New popup" }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setBusy(false);
    if (!res?.ok || !body.popup?.id) {
      setError(body.error || "Could not create a popup.");
      return;
    }
    router.push(`/console/popups/${body.popup.id}`);
  }

  async function removePopup(popup: PopupRow) {
    const ok = await confirm({
      message: `Delete "${popup.name}"? Any button set to open it will stop opening anything. This can't be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusyId(popup.id);
    setError("");
    const res = await fetch(`/api/console/popups/${popup.id}`, { method: "DELETE" }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) {
      setError("Could not delete this popup.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {dialog}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => void createPopup()} disabled={busy} className={primaryButton}>
          {busy ? "Creating…" : "+ New popup"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {popups.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-8 text-center text-sm text-ink-soft">
          No popups yet. Create one and design it with the same elements you use on a page.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-paper">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-semibold">Popup</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Elements</th>
                <th className="px-4 py-3 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {popups.map((popup) => (
                <tr key={popup.id}>
                  <td className="px-4 py-3 font-medium text-ink">{popup.name}</td>
                  <td className="hidden px-4 py-3 text-ink-soft sm:table-cell">{popup.elements}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link href={`/console/popups/${popup.id}`} className={primaryButton}>
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => void removePopup(popup)}
                        disabled={busyId === popup.id}
                        className={pillDanger}
                      >
                        {busyId === popup.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-soft">
        Need a plain form in a dialog instead? A Button can also open a saved form directly — set{" "}
        <span className="whitespace-nowrap">&quot;Button opens&quot;</span> to &quot;A saved form&quot;.{" "}
        <Link href="/console/forms" className={button + " ml-1 !py-1 !text-xs"}>
          Forms
        </Link>
      </p>
    </div>
  );
}
