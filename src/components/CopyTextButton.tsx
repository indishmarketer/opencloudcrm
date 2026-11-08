"use client";

import { useState } from "react";
import SafeImage from "@/components/SafeImage";
import Link from "next/link";
import { pickSignupOffer, type SignupOffer } from "@/lib/signupOffers";

/** showPopup: the moment a copy succeeds, shows an actual popup (not an
 * inline line of text) with a rotating offer -- headline, subheadline,
 * thumbnail, and a button. Owner's explicit brief after rejecting both a
 * fixed bottom banner AND a plain inline nudge line. */
export default function CopyTextButton({
  text,
  label = "Copy",
  showPopup = true,
}: {
  text: string;
  label?: string;
  showPopup?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [offer, setOffer] = useState<SignupOffer | null>(null);

  async function handleCopy() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    if (showPopup) setOffer(pickSignupOffer());
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
      >
        {copied ? "Copied!" : label}
      </button>

      {offer && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => setOffer(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-paper shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-video w-full">
              <SafeImage src={offer.image} alt="" fill sizes="384px" className="object-cover" />
              <button
                type="button"
                onClick={() => setOffer(null)}
                aria-label="Close"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-paper/90 text-ink shadow hover:bg-paper"
              >
                &times;
              </button>
            </div>
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Prompt copied</p>
              <p className="mt-2 font-display text-xl font-semibold">{offer.headline}</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{offer.subheadline}</p>
              <Link
                href={offer.href}
                className="mt-5 flex w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
              >
                {offer.buttonLabel}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
