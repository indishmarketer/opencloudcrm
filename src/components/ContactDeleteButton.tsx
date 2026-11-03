"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

/** Deletes one contact from its detail page, through the same endpoint the
 * contacts list uses for bulk delete, then goes back to the list. */
export default function ContactDeleteButton({ contactId, label, hasAccount }: {
  contactId: number;
  label: string;
  hasAccount: boolean;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    const ok = await confirm({
      message: hasAccount
        ? `Permanently delete ${label}? This removes the contact and their account, course access, community posts and email history.`
        : `Permanently delete ${label}? This removes the contact and their email history.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/console/contacts/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: [`c-${contactId}`] }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setError("Could not delete this contact.");
      return;
    }
    router.push("/console/contacts");
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="rounded-full border border-red-600 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
      >
        {busy ? "Deleting..." : "Delete contact"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {dialog}
    </div>
  );
}
