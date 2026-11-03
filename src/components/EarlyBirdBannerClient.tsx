"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// `position: fixed` keeps this out of normal document flow, so it never
// causes layout shift (CLS) or affects SEO on any page -- this whole
// component only renders client-side after mount (see the visible check
// below), so it's also never present in the HTML crawlers see.
export default function EarlyBirdBannerClient({
  text,
  link,
  version,
}: {
  text: string;
  link: string;
  version: string;
}) {
  const dismissKey = `earlybird-banner-dismissed-v${version}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // localStorage doesn't exist during SSR, so this can only run client-side
    // after mount -- the one extra render is the intended, unavoidable cost
    // of gating visibility on a browser-only API without a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!localStorage.getItem(dismissKey)) setVisible(true);
  }, [dismissKey]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink bg-ink text-paper">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:justify-center sm:gap-3 sm:px-4 sm:py-2.5">
        <Link
          href={link}
          className="min-w-0 flex-1 truncate text-xs font-medium underline underline-offset-2 hover:opacity-80 sm:flex-none sm:text-sm"
        >
          {text}
        </Link>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(dismissKey, "1");
            setVisible(false);
          }}
          aria-label="Dismiss"
          className="shrink-0 p-1 text-paper/70 hover:text-paper"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
