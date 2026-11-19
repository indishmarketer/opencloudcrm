"use client";

import { useState } from "react";
import EmailInput from "@/components/EmailInput";
import Turnstile from "@/components/Turnstile";

export default function ContactClient() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"form" | "otp" | "done">("form");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setErrorMessage("Please complete the verification check.");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: 4,
          pageUrl: typeof window !== "undefined" ? window.location.href : "https://indishmarketer.com/contact",
          fields: { name, email, message },
          turnstileToken: token,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to submit. Please try again.");
        setSubmitting(false);
        return;
      }

      if (data.step === "verify-otp") {
        setOtpEmail(data.email || email);
        setStep("otp");
      } else {
        setStep("done");
      }
    } catch {
      setErrorMessage("A network error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otpCode.length < 6) return;
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: 4,
          step: "verify-otp",
          otpEmail: otpEmail || email,
          otpCode,
          fields: { name, email, message },
          turnstileToken: token,
          pageUrl: typeof window !== "undefined" ? window.location.href : "https://indishmarketer.com/contact",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Invalid confirmation code.");
        setSubmitting(false);
        return;
      }
      setStep("done");
    } catch {
      setErrorMessage("Network error during verification. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 items-start">
      {/* ── LEFT COLUMN: HARDCODED CONTACT FORM ── */}
      <div className="rounded-3xl border border-line bg-paper p-6 sm:p-8 shadow-sm">
        {step === "done" ? (
          <div className="py-8 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent text-3xl">
              ✓
            </div>
            <h3 className="mt-4 font-display text-2xl font-bold text-ink">Message sent</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft max-w-md mx-auto">
              Thank you for reaching out, <strong className="text-ink">{name}</strong>. Your message has been delivered directly to Shubho Dey and you will receive a response shortly.
            </p>
            <button
              type="button"
              onClick={() => {
                setName("");
                setEmail("");
                setMessage("");
                setOtpCode("");
                setStep("form");
              }}
              className="mt-6 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-on shadow-[0_8px_20px_-10px_var(--accent)] hover:opacity-90 transition-opacity"
            >
              Send another message
            </button>
          </div>
        ) : step === "otp" ? (
          <div className="py-2 animate-in fade-in duration-200">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/25 bg-accent-soft text-accent text-2xl">
              ✉
            </div>
            <h3 className="mt-3 font-display text-2xl font-bold text-ink">Check your inbox</h3>
            <p className="mt-2 text-sm text-ink-soft">
              We just sent a 6-digit confirmation code to <strong className="text-ink">{otpEmail}</strong>. Enter it below to send your message.
            </p>

            <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
              <div>
                <label htmlFor="contact-otp-code" className="sr-only">
                  6-digit code
                </label>
                <input
                  id="contact-otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-center font-mono text-2xl tracking-widest outline-none transition focus:border-accent"
                />
              </div>

              {errorMessage && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || otpCode.length < 6}
                className="w-full rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-on shadow-[0_8px_20px_-10px_var(--accent)] transition-all hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Verifying..." : "Confirm & Send message →"}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="contact-name" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Name <span className="text-accent">*</span>
              </label>
              <input
                id="contact-name"
                name="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none transition focus:border-accent"
              />
            </div>

            <div>
              <label htmlFor="contact-email" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Email address <span className="text-accent">*</span>
              </label>
              <div className="mt-1.5">
                <EmailInput
                  id="contact-email"
                  name="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@domain.com"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none transition focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="contact-message" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Message <span className="text-accent">*</span>
              </label>
              <textarea
                id="contact-message"
                name="message"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell me what you're trying to build, or what you're paying for that you'd rather own..."
                className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none transition focus:border-accent"
              />
            </div>

            <div className="pt-1">
              <Turnstile onToken={setToken} />
            </div>

            {errorMessage && (
              <p role="alert" className="text-xs font-medium text-red-600">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !token}
              className="w-full rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-on shadow-[0_8px_20px_-10px_var(--accent)] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send message →"}
            </button>
          </form>
        )}
      </div>

      {/* ── RIGHT COLUMN: HARDCODED BUSINESS DETAILS CARD ── */}
      <div className="rounded-3xl border border-line bg-paper-soft/80 p-6 sm:p-8 shadow-sm">
        <div className="border-b border-line pb-4 mb-6">
          <h3 className="font-display text-xl font-semibold text-ink">Business details</h3>
          <p className="text-sm text-ink-soft mt-1">
            Indish Marketer is a sole proprietorship owned by Shubho Dey.
          </p>
        </div>

        <div className="space-y-6 text-sm">
          {/* Email Item */}
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent-soft text-accent shadow-xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Email</p>
              <a href="mailto:info@indishmarketer.com" className="mt-0.5 block font-medium text-ink hover:text-accent transition-colors">
                info@indishmarketer.com
              </a>
            </div>
          </div>

          {/* Phone & Hours Item */}
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent-soft text-accent shadow-xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Phone &amp; Hours</p>
              <p className="mt-0.5 font-medium text-ink">+91 9774293449</p>
              <p className="mt-0.5 text-xs text-ink-soft">Mon to Fri, 9:00 AM to 5:00 PM IST</p>
            </div>
          </div>

          {/* Registered Address Item */}
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent-soft text-accent shadow-xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Registered Address</p>
              <p className="mt-0.5 text-sm font-medium leading-relaxed text-ink">
                House No. 004, Dharambasti, Bholaganj<br />
                Shillong, East Khasi Hills<br />
                Meghalaya 793107, India
              </p>
            </div>
          </div>

          {/* Udyam Registration Item */}
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent-soft text-accent shadow-xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Udyam Registration</p>
              <span className="mt-1.5 inline-block rounded-md border border-accent/25 bg-paper px-2.5 py-1 font-mono text-xs font-semibold text-accent shadow-xs">
                UDYAM-ML-04-0021234
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-accent/20 bg-accent-soft/40 p-4 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-soft">Prefer a direct conversation?</p>
          <a href="/book/discovery-call" className="text-xs font-semibold text-accent hover:underline flex items-center gap-1">
            Book a call &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
