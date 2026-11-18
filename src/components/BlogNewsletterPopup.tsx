"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Turnstile from "@/components/Turnstile";
import EmailInput from "@/components/EmailInput";
import { detectEmailTypo } from "@/lib/emailValidation";
import { trackEvent } from "@/lib/gtag";

const DISMISSED_KEY = "im_blog_newsletter_dismissed";
const SUBSCRIBED_KEY = "im_newsletter_subscribed";

export default function BlogNewsletterPopup({
  postTitle,
  postSlug,
}: {
  postTitle?: string;
  postSlug?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "otp" | "done">("form");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const triggerArmed = useRef(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const triggerOpen = useCallback(() => {
    if (!triggerArmed.current) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISSED_KEY) || localStorage.getItem(SUBSCRIBED_KEY)) {
      triggerArmed.current = false;
      return;
    }
    triggerArmed.current = false;
    setOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISSED_KEY) || localStorage.getItem(SUBSCRIBED_KEY)) {
      triggerArmed.current = false;
      return;
    }

    // 1. Time-based trigger: 6 seconds of reading
    timerRef.current = setTimeout(() => {
      triggerOpen();
    }, 6000);

    // 2. Scroll-depth trigger: 30% scroll through the article
    function onScroll() {
      const scrollY = window.scrollY;
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0 && scrollY / totalHeight >= 0.3) {
        triggerOpen();
      }
    }

    // 3. Desktop exit-intent trigger: mouse moving out top of viewport
    function onMouseLeave(e: MouseEvent) {
      if (e.clientY <= 0) {
        triggerOpen();
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [triggerOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape key closes modal
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleDismiss();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handleDismiss() {
    setOpen(false);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!turnstileToken) {
      setError("Please complete the verification check.");
      return;
    }

    // Auto-fix typo before submit if present
    const typoCheck = detectEmailTypo(email);
    const finalEmail = typoCheck.hasTypo && typoCheck.suggestedEmail ? typoCheck.suggestedEmail : email.trim();

    setStatus("submitting");
    setError("");

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: finalEmail,
          source: postSlug ? `blog-popup:${postSlug}` : "blog-popup",
          turnstileToken,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Could not subscribe. Please try again.");
      }

      setEmail(finalEmail);
      setStep("otp");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const cleanCode = code.replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      setError("Please enter the 6-digit code.");
      return;
    }

    setStatus("submitting");
    setError("");

    try {
      const res = await fetch("/api/newsletter/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: cleanCode }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Incorrect or expired code.");
      }

      trackEvent("generate_lead", { form: "blog_newsletter_popup", post: postSlug });
      if (typeof window !== "undefined") {
        localStorage.setItem(SUBSCRIBED_KEY, "1");
      }
      setStep("done");
      setStatus("idle");

      // Auto close after 3 seconds
      setTimeout(() => {
        setOpen(false);
      }, 3500);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Incorrect code.");
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-4 sm:items-center backdrop-blur-sm transition-all"
      role="dialog"
      aria-modal="true"
      onClick={handleDismiss}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl border border-line bg-paper p-6 sm:p-8 text-ink shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-paper-soft text-ink-soft transition-colors hover:bg-line hover:text-ink"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* ── STEP 1: SIGNUP FORM ────────────────────────────────────────── */}
        {step === "form" && (
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-soft px-3 py-1 text-xs font-semibold text-ink-soft">
              <span>📩</span>
              <span>Indish Marketer Dispatch</span>
            </div>

            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Enjoying this read?
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Get real marketing automations, open-source playbooks, and unfiltered case studies delivered straight to your inbox every week. Free, zero spam.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="blog-popup-name" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Your name
                </label>
                <input
                  id="blog-popup-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none transition focus:border-ink"
                />
              </div>

              <div>
                <label htmlFor="blog-popup-email" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Email address
                </label>
                <div className="mt-1.5">
                  <EmailInput
                    id="blog-popup-email"
                    name="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@domain.com"
                  />
                </div>
              </div>

              {status === "error" && error && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  {error}
                </p>
              )}

              <div className="pt-1">
                <Turnstile onToken={handleToken} />
              </div>

              <button
                type="submit"
                disabled={status === "submitting" || !turnstileToken}
                className="w-full rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-paper shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "submitting" ? "Sending confirmation..." : "Get free weekly insights"}
              </button>

              <p className="text-center text-[11px] text-ink-soft">
                Join 5,000+ marketers. One-click unsubscribe anytime.
              </p>
            </form>
          </div>
        )}

        {/* ── STEP 2: OTP VERIFICATION ──────────────────────────────────── */}
        {step === "otp" && (
          <div className="py-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-paper-soft text-2xl">
              ✉️
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
              Check your inbox
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              We just sent a 6-digit confirmation code to <strong className="text-ink">{email}</strong>. Enter it below or click the link in your email to confirm.
            </p>

            <form onSubmit={handleVerify} className="mt-6 space-y-4">
              <div>
                <label htmlFor="blog-popup-code" className="sr-only">
                  6-digit confirmation code
                </label>
                <input
                  id="blog-popup-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-center font-mono text-2xl tracking-widest outline-none transition focus:border-ink"
                />
              </div>

              {status === "error" && error && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "submitting" || code.length < 6}
                className="w-full rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
              >
                {status === "submitting" ? "Verifying..." : "Confirm & Subscribe"}
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 3: DONE ──────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="py-6 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">
              🎉
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
              You&apos;re subscribed!
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Thank you for subscribing to Indish Marketer. Keep an eye on your inbox for our upcoming edition!
            </p>
            <button
              type="button"
              onClick={handleDismiss}
              className="mt-6 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
            >
              Back to article
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
