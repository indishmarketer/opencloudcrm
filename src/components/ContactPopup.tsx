"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Turnstile from "@/components/Turnstile";
import { trackEvent } from "@/lib/gtag";

/** A modal variant of the page builder's contact form (ContactFormBlock):
 * same two-step request-code/verify flow and /api/contact/* endpoints, just
 * portaled into a dialog instead of rendered inline on a page. Used when a
 * Hero/CTA button's action is set to "contactPopup" -- see blockViews.tsx. */
export default function ContactPopup({
  buttonLabel,
  buttonClassName,
}: {
  buttonLabel: string;
  buttonClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "otp" | "done">("form");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function reset() {
    setStep("form");
    setStatus("idle");
    setError("");
    setTurnstileToken("");
  }

  function handleClose() {
    setOpen(false);
  }

  async function handleRequestOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
    };
    try {
      const res = await fetch("/api/contact/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, turnstileToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong. Try again.");
      }
      setFormData(data);
      setStep("otp");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const code = (e.currentTarget.elements.namedItem("code") as HTMLInputElement).value;
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Incorrect code.");
      }
      trackEvent("generate_lead", { form: "contact_popup" });
      setStep("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Incorrect code.");
    } finally {
      setStatus("idle");
    }
  }

  const field =
    "w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink-soft outline-none transition-colors focus:border-ink";

  const modalContent = open && (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden overflow-y-auto rounded-t-2xl border border-line bg-paper p-6 text-ink shadow-2xl sm:rounded-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-paper-soft text-ink-soft transition-colors hover:bg-line hover:text-ink"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {step === "form" && (
          <>
            <h3 className="pr-6 font-display text-xl font-semibold leading-snug tracking-tight text-ink sm:text-2xl">
              Send us a message
            </h3>
            <form className="mt-6 space-y-3.5" onSubmit={handleRequestOtp}>
              <div>
                <label htmlFor="popup-contact-name" className="sr-only">Your name</label>
                <input id="popup-contact-name" name="name" type="text" required placeholder="Your name" autoComplete="name" className={field} />
              </div>
              <div>
                <label htmlFor="popup-contact-email" className="sr-only">Email address</label>
                <input id="popup-contact-email" name="email" type="email" required placeholder="you@email.com" autoComplete="email" className={field} />
              </div>
              <div>
                <label htmlFor="popup-contact-message" className="sr-only">Message</label>
                <textarea id="popup-contact-message" name="message" rows={4} required placeholder="How can we help?" className={field} />
              </div>

              {status === "error" && <p className="text-xs font-medium text-red-600">{error}</p>}

              <Turnstile onToken={handleToken} />

              <button
                type="submit"
                disabled={status === "submitting" || !turnstileToken}
                className="w-full rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "submitting" ? "Sending…" : "Send message"}
              </button>
            </form>
          </>
        )}

        {step === "otp" && (
          <div className="pt-2">
            <h3 className="font-display text-xl font-semibold text-ink sm:text-2xl">Check your email</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              We sent a code to <strong className="text-ink">{formData.email}</strong>. Enter it below to send your message.
            </p>
            <form className="mt-6 space-y-3.5" onSubmit={handleVerify}>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="123456"
                className={`${field} text-center text-lg tracking-widest`}
              />
              {status === "error" && <p className="text-xs font-medium text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {status === "submitting" ? "Verifying…" : "Confirm and send"}
              </button>
            </form>
          </div>
        )}

        {step === "done" && (
          <div className="py-4 text-center sm:py-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="mt-4 font-display text-xl font-semibold text-ink sm:text-2xl">Message sent</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">Thanks for reaching out -- we&apos;ll get back to you soon.</p>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-85"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={buttonClassName}
      >
        {buttonLabel}
      </button>

      {open && typeof document !== "undefined" && createPortal(modalContent, document.body)}
    </>
  );
}
