"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import SavedForm from "@/components/SavedForm";

/** Opens a saved form (Console -> Forms) in a modal when the button is
 * clicked -- the formPopup action on Hero/CTA buttons. The form itself
 * (fields, copy, submit) is fetched and rendered by SavedForm; this just
 * supplies the modal chrome, same pattern as ContactPopup/GuidePopup. */
export default function SavedFormPopup({
  formId,
  buttonLabel,
  buttonClassName,
}: {
  formId: number;
  buttonLabel: string;
  buttonClassName: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const modalContent = open && (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border border-line bg-paper p-6 text-ink shadow-2xl sm:rounded-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-paper-soft text-ink-soft transition-colors hover:bg-line hover:text-ink"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <SavedForm formId={formId} />
      </div>
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      {open && typeof document !== "undefined" && createPortal(modalContent, document.body)}
    </>
  );
}
