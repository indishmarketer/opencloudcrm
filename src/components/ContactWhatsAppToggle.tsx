"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";
import ToggleSwitch from "@/components/ToggleSwitch";

const STATUS_LABEL: Record<string, string> = {
  subscribed: "Opted in",
  unsubscribed: "Opted out",
  unknown: "Not opted in",
};

/** WhatsApp consent for one contact, separate from the email toggle next to
 * it because they are separate permissions. Turning it back on for someone
 * who sent STOP asks first: that is their own decision being undone, and on
 * WhatsApp it is also the signal Meta uses to score the sending number. */
export default function ContactWhatsAppToggle({
  contactId,
  status: initialStatus,
  hasPhone,
}: {
  contactId: number;
  status: string;
  hasPhone: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  const subscribed = status === "subscribed";

  async function toggle() {
    if (!subscribed && status === "unsubscribed") {
      const ok = await confirm({
        message: "This person opted out of WhatsApp, usually by replying STOP. Only turn it back on if they asked you to.",
        confirmLabel: "Turn on",
      });
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/console/contacts/${contactId}/whatsapp`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed: !subscribed }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Could not update.");
      return;
    }
    setStatus(body.status);
    router.refresh();
  }

  return (
    <div>
      {dialog}
      <ToggleSwitch
        on={subscribed}
        label="WhatsApp messages"
        state={STATUS_LABEL[status] || status}
        tone={subscribed ? "on" : status === "unsubscribed" ? "off" : "unknown"}
        busy={busy}
        disabled={!subscribed && !hasPhone}
        onToggle={toggle}
      />
      {!hasPhone && <p className="mt-1 text-xs text-ink-soft">No phone number on file.</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
