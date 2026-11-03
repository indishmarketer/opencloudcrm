"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Turnstile from "@/components/Turnstile";

type GuideSummary = {
  id: number;
  slug: string;
  title: string;
  headline: string;
  subheadline: string | null;
  coverImageUrl: string | null;
};

/** The free-guide lead magnet popup: a responsive modal (horizontal on desktop
 * with a 3D guide cover preview on the left; vertical on mobile).
 * Portaled to document.body so it escapes any ancestor transforms or overflow-hidden.
 * Submitting requests the guide via /api/guide/request:
 * - If the contact/user already exists in the database, the download is unlocked
 *   IMMEDIATELY without sending any OTP verification code.
 * - If the contact is new, a verification email is sent with the magic link.
 */
export default function GuidePopup({
  guide,
  buttonLabel,
  buttonClassName,
}: {
  guide: GuideSummary;
  buttonLabel: string;
  buttonClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "sent" | "download">("form");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

  // Pre-fill email if user is already logged in
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.email) {
          setEmail((prev) => prev || d.user.email);
        }
      })
      .catch(() => {});
  }, []);

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
    setPhone("");
    setDownloadUrl(null);
    setSubmittedEmail("");
    setTurnstileToken("");
  }

  function handleClose() {
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;
    setStatus("submitting");
    setError("");

    try {
      const res = await fetch("/api/guide/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guideId: guide.id,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      setSubmittedEmail(email.trim());

      if (data.alreadyVerified && data.downloadUrl) {
        // Contact is already in database: instant unlock!
        setDownloadUrl(data.downloadUrl);
        setStep("download");
      } else {
        // New visitor: sent verification link
        setStep("sent");
      }
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-line bg-paper text-ink shadow-2xl sm:flex-row sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
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

        {/* Cover image preview panel */}
        {guide.coverImageUrl && (
          <div className="flex shrink-0 items-center justify-center border-b border-line bg-paper-soft p-6 sm:w-[280px] sm:border-b-0 sm:border-r">
            <div className="relative aspect-[3/4] w-28 overflow-hidden rounded-lg border border-line/60 bg-ink shadow-xl sm:w-44">
              <Image
                src={guide.coverImageUrl}
                alt={guide.title}
                fill
                sizes="(min-width: 640px) 240px, 160px"
                className="object-cover"
                priority
              />
            </div>
          </div>
        )}

        {/* Form and content panel */}
        <div className="flex flex-1 flex-col justify-center overflow-y-auto p-6 sm:p-8">
          {step === "form" && (
            <>
              <div className="pr-6">
                <span className="inline-block rounded-full border border-ink/15 bg-paper-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  Free Starter Guide
                </span>
                <h3 className="mt-2.5 font-display text-xl font-semibold leading-snug tracking-tight text-ink sm:text-2xl">
                  {guide.headline}
                </h3>
                {guide.subheadline && (
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {guide.subheadline}
                  </p>
                )}
              </div>

              <form className="mt-6 space-y-3.5" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="guide-name" className="sr-only">
                    Your name
                  </label>
                  <input
                    id="guide-name"
                    name="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    className={field}
                  />
                </div>

                <div>
                  <label htmlFor="guide-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="guide-email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    className={field}
                  />
                </div>

                <div>
                  <label htmlFor="guide-phone" className="sr-only">
                    Phone number (optional)
                  </label>
                  <input
                    id="guide-phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number (optional)"
                    autoComplete="tel"
                    className={field}
                  />
                </div>

                {status === "error" && (
                  <p className="text-xs font-medium text-red-600">{error}</p>
                )}

                <Turnstile onToken={handleToken} />

                <button
                  type="submit"
                  disabled={status === "submitting" || !turnstileToken}
                  className="w-full rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {status === "submitting" ? "Sending your guide…" : "Get the free guide"}
                </button>
              </form>
            </>
          )}

          {step === "download" && (
            <div className="py-4 text-center sm:py-6 sm:text-left">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="mt-4 font-display text-2xl font-semibold text-ink">
                Your guide is ready!
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Welcome back! Since your contact is already in our database, your copy of <strong className="text-ink">{guide.title}</strong> is unlocked right away.
              </p>
              {downloadUrl && (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-paper transition-opacity hover:opacity-85"
                  >
                    <span>Download Guide (PDF)</span>
                    <span aria-hidden="true">&darr;</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-full border border-line px-5 py-3 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
                  >
                    Close
                  </button>
                </div>
              )}
              <p className="mt-4 text-xs text-ink-soft">
                We also sent a direct download link to <strong className="text-ink">{submittedEmail}</strong> for your records.
              </p>
            </div>
          )}

          {step === "sent" && (
            <div className="py-4 text-center sm:py-8 sm:text-left">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="mt-4 font-display text-2xl font-semibold text-ink">
                Thank you! Check your email
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                We just sent the verification link to <strong className="text-ink">{submittedEmail}</strong>. Click the link in that email to download your guide right away.
              </p>
              <div className="mt-6 flex justify-center sm:justify-start">
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
