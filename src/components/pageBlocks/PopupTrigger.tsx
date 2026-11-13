"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PopupSettings } from "@/lib/popupsShape";

/** A button that opens a designed popup.
 *
 * The popup's elements are rendered by the caller and handed over as
 * `children`: the page is server-rendered, so its contents arrive with the
 * page rather than being fetched when the popup opens, and this component
 * stays purely the dialog chrome -- overlay, panel, close button, escape
 * key, scroll lock. It never needs to know what an element is. */
export default function PopupTrigger({
  buttonLabel,
  buttonClassName,
  buttonStyle,
  settings,
  children,
}: {
  buttonLabel: string;
  buttonClassName: string;
  buttonStyle?: React.CSSProperties;
  settings: PopupSettings;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dialog = open && (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center px-0 sm:items-center sm:p-6"
      style={{ backgroundColor: `rgba(10,10,10,${Math.min(100, Math.max(0, settings.overlayOpacity)) / 100})` }}
      role="dialog"
      aria-modal="true"
      aria-label={settings.ariaLabel || buttonLabel || "Dialog"}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: settings.maxWidth,
          padding: settings.padding,
          borderRadius: settings.borderRadius,
          backgroundColor: settings.backgroundColor || undefined,
        }}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-paper text-ink shadow-2xl sm:rounded-2xl"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-paper-soft text-ink-soft transition-colors hover:bg-line hover:text-ink"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName} style={buttonStyle}>
        {buttonLabel}
      </button>
      {typeof document !== "undefined" && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
