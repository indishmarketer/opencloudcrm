"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import NewsletterSignupForm from "@/components/NewsletterSignupForm";

/** A button that opens the newsletter sign-up form in a modal, instead of
 * printing the whole form straight onto the page.
 *
 * The newsletter hero used to render two inputs, a Turnstile widget and a
 * button inline, which is four stacked controls before a first-time reader
 * has been told why they should fill any of them in, and it pushed the
 * image column on that hero down to match. One button reads as one
 * decision; the form only has to exist once the decision is made.
 *
 * Deliberately the same modal shell as BlogNewsletterPopup: portal to
 * body, dimmed blurred backdrop, rounded panel, close button top right,
 * Escape and backdrop click both close, body scroll locked while open.
 * That popup opens itself on a timer while someone is reading a post;
 * this one only ever opens because the reader pressed the button, so
 * there is no dismissal memory to keep -- pressing it again should always
 * work.
 *
 * The form inside is the same NewsletterSignupForm the bottom-of-page CTA
 * renders inline, so both routes post to the same endpoint and show the
 * same "check your inbox" state. */
export default function NewsletterSignupDialog({
  label = "Subscribe for free →",
  title = "Get the Sunday email",
  blurb,
  className = "",
}: {
  label?: string;
  title?: string;
  blurb?: string;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes, and the page behind stops scrolling while it is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex items-center justify-center rounded-xl bg-accent px-7 py-3.5 text-sm font-semibold text-accent-on shadow-[0_8px_20px_-10px_var(--accent)] transition-opacity hover:opacity-90"
        }
      >
        {label}
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm transition-all sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-label={title}
              onClick={close}
            >
              <div
                className="relative w-full max-w-lg rounded-3xl border border-line bg-paper p-6 text-ink shadow-2xl sm:p-8"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-paper-soft text-ink-soft transition-colors hover:bg-line hover:text-ink"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>

                <h2 className="pr-10 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                  {title}
                </h2>
                {blurb ? (
                  <p className="mt-2 text-sm leading-6 text-ink-soft">{blurb}</p>
                ) : null}

                <div className="mt-6">
                  <NewsletterSignupForm />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
