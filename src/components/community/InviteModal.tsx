"use client";

import { useState } from "react";
import { SITE_NAME, SITE_URL } from "@/config/brand";

export default function InviteModal({
  username,
  isOpen,
  onClose,
}: {
  username?: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const inviteUrl = typeof window !== "undefined" && username
    ? `${window.location.origin}/signup?ref=${encodeURIComponent(username)}`
    : `${SITE_URL}/signup`;

  const shareText = encodeURIComponent(
    `Join the ${SITE_NAME} community — discuss automation, AI agents, and indie growth:`
  );

  async function handleCopy() {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-line bg-paper p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-ink-soft hover:bg-paper-soft hover:text-ink transition-colors"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-paper">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">Invite Members</h3>
            <p className="text-xs text-ink-soft">Grow the community and earn points</p>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          Share your referral link with colleagues and creators. When someone joins with your link, you earn{" "}
          <strong className="text-ink font-semibold">+10 community points</strong>.
        </p>

        <div className="mt-5">
          <label className="text-xs font-medium text-ink-soft">Your invite link</label>
          <div className="mt-1.5 flex gap-2">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              className="flex-1 truncate rounded-xl border border-line bg-paper-soft px-3.5 py-2 text-xs text-ink focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-xl bg-ink px-4 py-2 text-xs font-medium text-paper transition-colors hover:opacity-80"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs font-medium text-ink-soft mb-2.5">Share via</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${shareText}%20${encodeURIComponent(inviteUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              WhatsApp
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(inviteUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              X / Twitter
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(inviteUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              LinkedIn
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(`Join me on ${SITE_NAME} Community`)}&body=${shareText}%20${encodeURIComponent(inviteUrl)}`}
              className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              Email
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
