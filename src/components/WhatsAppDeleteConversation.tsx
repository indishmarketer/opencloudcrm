"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

/** Deletes a whole conversation from our side: the messages and the files
 * that came with them.
 *
 * It says plainly what cannot be undone and what it does not reach, because
 * both matter and neither is obvious. Their copy on WhatsApp is theirs. The
 * delivery and read figures in Reports are counted from these same rows, so
 * a deleted conversation leaves those numbers. */
export default function WhatsAppDeleteConversation({
  conversationKey,
  name,
  redirectToList = false,
  className = "",
}: {
  conversationKey: string;
  name: string;
  /** From inside the thread there is nothing left to show afterwards. */
  redirectToList?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    const ok = await confirm({
      message: `Delete the whole conversation with ${name}? Every message and every photo or video in it is removed from our database and storage for good. Their copy on WhatsApp stays, and these messages drop out of the WhatsApp reports.`,
      confirmLabel: "Delete conversation",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/console/whatsapp/conversations/${conversationKey}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not delete that conversation.");
      return;
    }
    if (redirectToList) router.push("/console/whatsapp/messages");
    router.refresh();
  }

  return (
    <>
      {dialog}
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className={`rounded-full border border-line px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:border-red-400 disabled:opacity-50 ${className}`}
      >
        {busy ? "Deleting…" : "Delete chat"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </>
  );
}
