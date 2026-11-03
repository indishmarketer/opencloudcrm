"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AnchoredPopover from "@/components/AnchoredPopover";
import { useConfirm } from "@/components/ConfirmDialog";
import { PURPOSE_LABELS, SENDING_PURPOSES, type SendingPurpose } from "@/lib/whatsappSenderShape";

const PURPOSE_HINTS: Record<SendingPurpose, string> = {
  default: "Everything that has no number of its own, and replies",
  marketing: "Offers and campaigns. The ones people block, so keep an eye on quality",
  utility: "Order, booking and account messages about something they just did",
  authentication: "One-time passcodes only",
};

/** Chooses which kinds of message this number sends.
 *
 * Which number sends used to be an env var, so changing it meant a
 * redeploy, and it was all-or-nothing. Splitting it by kind is the point of
 * having a second number: marketing is what gets blocked and reported, and
 * a number's quality rating decides its daily limit, so marketing can run
 * from one number while confirmations and passcodes keep going out from a
 * number whose rating is protected.
 *
 * Replies are deliberately never routed here. Meta ties the 24-hour reply
 * window to the pair of numbers, so an open conversation always answers
 * from the number it arrived on. */
export default function WhatsAppNumberPicker({
  phoneNumberId,
  displayNumber,
  assigned,
}: {
  phoneNumberId: string;
  displayNumber: string;
  /** The purposes currently pointing at this number. */
  assigned: SendingPurpose[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  async function set(purpose: SendingPurpose, on: boolean) {
    if (purpose === "default" && !on) return;
    const ok = await confirm({
      message: on
        ? `Send ${PURPOSE_LABELS[purpose].toLowerCase()} messages from ${displayNumber} from now on?${
            purpose === "default"
              ? " Anything without its own number goes out from here, including the site's confirmations."
              : ""
          } Conversations already open keep replying from the number they arrived on.`
        : `Stop sending ${PURPOSE_LABELS[purpose].toLowerCase()} messages from ${displayNumber}? They go back to whichever number handles everything.`,
      confirmLabel: on ? "Use this number" : "Remove",
    });
    if (!ok) return;

    setBusy(purpose);
    setError("");
    const res = await fetch("/api/console/whatsapp/numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumberId: on ? phoneNumberId : null, purpose }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Could not change that.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {dialog}
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
      >
        Use this number for…
      </button>
      <AnchoredPopover anchor={trigger} open={open} onClose={close} width={352} className="p-3">
        <div>
          <p className="px-1 pb-2 text-xs font-medium text-ink">What {displayNumber} sends</p>
          <div className="space-y-0.5">
            {SENDING_PURPOSES.map((purpose) => {
              const on = assigned.includes(purpose);
              return (
                <button
                  key={purpose}
                  type="button"
                  disabled={Boolean(busy) || (purpose === "default" && on)}
                  onClick={() => set(purpose, !on)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-paper-soft disabled:opacity-60"
                >
                  <span aria-hidden="true" className={`mt-0.5 ${on ? "text-ink" : "text-line"}`}>
                    {on ? "✓" : "○"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{PURPOSE_LABELS[purpose]}</span>
                    <span className="mt-0.5 block text-xs text-ink-soft">{PURPOSE_HINTS[purpose]}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 border-t border-line px-1 pt-2 text-xs text-ink-soft">
            A kind with no number of its own goes out from whichever number handles everything.
          </p>
          {error && <p className="mt-2 px-1 text-xs text-red-600">{error}</p>}
        </div>
      </AnchoredPopover>
    </>
  );
}
