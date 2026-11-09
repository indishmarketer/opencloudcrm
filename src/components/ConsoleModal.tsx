"use client";

import { useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

// Hidden-but-mounted state. PayPal's iframes force visibility:visible on
// themselves, so "invisible" alone leaks them onto the page: opacity can't
// be overridden by children, and the off-screen shift keeps them out of
// view and out of reach even if a style slips.
const HIDDEN = "invisible opacity-0 pointer-events-none -translate-x-[200vw]";

/** Shared modal (console and checkout). A real dialog for assistive tech:
 * labelled by its title, focus moves inside on open, Tab stays inside, and
 * focus returns to whatever opened it on close. Escape and the close button
 * close it. A backdrop click never discards an open form by accident.
 *
 * `open={false}` keeps it mounted but invisible and inert, so slow
 * third-party content inside (PayPal's button iframes) can finish loading
 * before the buyer opens it. Callers that just mount/unmount it can leave
 * `open` out. */
export default function ConsoleModal({
  title,
  onClose,
  children,
  wide = false,
  size,
  maxWidth,
  open = true,
  actions,
  meta,
  closeOnEscape = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  size?: "sm" | "md" | "lg" | "wide";
  maxWidth?: string;
  open?: boolean;
  actions?: React.ReactNode;
  /** Status or other short detail about what the title names, kept on the
   * title line rather than pushed into the body: on a wide modal the two
   * ended up a full panel apart, which read as unrelated. */
  meta?: React.ReactNode;
  closeOnEscape?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const widthClass =
    maxWidth ??
    (size === "wide" || wide
      ? "max-w-4xl"
      : size === "lg"
        ? "max-w-3xl"
        : size === "md"
          ? "max-w-2xl"
          : "max-w-sm");
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && closeOnEscape) {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstItem || document.activeElement === panel)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open, closeOnEscape]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 ${open ? "" : HIDDEN}`}
      aria-hidden={open ? undefined : true}
      inert={!open}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[88dvh] w-full overflow-y-auto rounded-2xl border border-line bg-paper p-4 shadow-xl outline-none sm:p-6 ${widthClass}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 id={titleId} className="font-display text-lg font-semibold">{title}</h3>
            {meta}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              title="Close"
              // pointer-events-auto!: this modal isn't portaled, so one
              // opened from inside a page-editor row's "+ Add element"
              // flow is still a DOM descendant of that row's INERT
              // wrapper (`[&_button]:pointer-events-none`) -- a modal's
              // own close button must always be clickable regardless of
              // what triggered it open.
              className="pointer-events-auto! rounded-full p-2 text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
