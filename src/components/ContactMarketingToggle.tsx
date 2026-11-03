"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";
import ToggleSwitch from "@/components/ToggleSwitch";

const STATUS_LABEL: Record<string, string> = {
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  pending: "Waiting for confirmation",
  unknown: "Not subscribed",
};

/** Lets the owner turn marketing email on or off for one contact. Turning it
 * back on for someone who unsubscribed asks first, since that undoes their
 * own choice. */
export default function ContactMarketingToggle({
  contactId,
  status: initialStatus,
  deliverability,
}: {
  contactId: number;
  status: string;
  deliverability: string;
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
        message: "This person unsubscribed. Only turn marketing emails back on if they asked you to.",
        confirmLabel: "Turn on",
      });
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/console/contacts/${contactId}/marketing`, {
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
        label="Marketing emails"
        state={STATUS_LABEL[status] || status}
        tone={subscribed ? "on" : status === "unsubscribed" ? "off" : "unknown"}
        busy={busy}
        onToggle={toggle}
      />
      {subscribed && ["bounced", "complained", "invalid"].includes(deliverability) && (
        <p className="mt-1 text-xs text-ink-soft">Emails still won&apos;t send: this address {deliverability === "complained" ? "marked mail as spam" : "bounced"}.</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
