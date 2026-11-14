"use client";

import { useRef, useState } from "react";
import { PopupDialog } from "@/components/pageBlocks/PopupTrigger";
import type { PopupSettings } from "@/lib/popupsShape";

/** Wraps a rich-text block's static HTML only when it actually contains a
 * hyperlink set to "Open a popup" (`data-popup-id`) -- RichTextBlock only
 * renders this in that case, so plain text pays nothing extra.
 *
 * The HTML itself is still server-rendered and ships with the page, exactly
 * like the plain `dangerouslySetInnerHTML` path it replaces here; this only
 * adds one delegated click listener and the floating dialog, reusing the
 * same `PopupDialog` chrome a Button's "opens a popup" action already
 * renders through `PopupTrigger`. */
export default function RichTextPopupHost({
  html,
  popups,
  className,
  style,
}: {
  html: string;
  popups: Record<number, { settings: PopupSettings; content: React.ReactNode }>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activePopup = openId !== null ? popups[openId] : undefined;

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        style={style}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          const anchor = (e.target as HTMLElement).closest("a[data-popup-id]");
          if (!anchor || !containerRef.current?.contains(anchor)) return;
          e.preventDefault();
          const id = Number(anchor.getAttribute("data-popup-id")) || 0;
          if (id && popups[id]) setOpenId(id);
        }}
      />
      {activePopup && (
        <PopupDialog open settings={activePopup.settings} onClose={() => setOpenId(null)} ariaLabel="Dialog">
          {activePopup.content}
        </PopupDialog>
      )}
    </>
  );
}
