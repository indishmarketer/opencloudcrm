"use client";

import { useCallback, useState } from "react";
import Turnstile from "@/components/Turnstile";
import { trackEvent } from "@/lib/gtag";

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.5-4 5-6 7.5-6s6 2 7.5 6" strokeLinecap="round" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function NewsletterSignupForm({
  source = "newsletter-page",
  dark = false,
  stacked = false,
}: {
  source?: string;
  /** True when this form sits directly on a dark section background (e.g.
   * the hero), so its caption/error text needs a light color instead of
   * the default ink-soft, which would be unreadable on dark. Only affects
   * text outside the input fields -- the inputs themselves stay
   * white-background/dark-text in both placements, matching the reference. */
  dark?: boolean;
  /** Stack and label each field for the dedicated newsletter page signup. */
  stacked?: boolean;
}) {
  const [step, setStep] = useState<"form" | "otp" | "done">("form");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const emailValue = (form.elements.namedItem("email") as HTMLInputElement).value;
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: emailValue, source, turnstileToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong.");
      }
      setEmail(emailValue);
      setStep("otp");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const code = (e.currentTarget.elements.namedItem("code") as HTMLInputElement).value;
    try {
      const res = await fetch("/api/newsletter/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Incorrect code.");
      }
      trackEvent("generate_lead", { form: source });
      setStep("done");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Incorrect code.");
    }
  }

  if (step === "done") {
    return (
      <div className="rounded-2xl border border-line bg-paper p-6 text-center text-ink">
        <p className="font-display text-lg font-semibold">You&apos;re confirmed.</p>
        <p className="mt-1 text-sm text-ink-soft">Check your inbox for the next issue.</p>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="rounded-2xl border border-line bg-paper p-6 text-ink">
        <p className="font-display text-lg font-semibold">Check your email</p>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          We sent a link to {email} — click &ldquo;Confirm now&rdquo; in that email, or enter the
          6-digit code below. Either one confirms you&apos;re a real person, not a bot.
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleVerify}>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            required
            placeholder="123456"
            className="w-full rounded-lg border border-line bg-paper px-4 py-3 text-center text-lg tracking-widest text-ink outline-none placeholder:text-ink-soft focus:border-ink"
          />
          {status === "error" && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {status === "submitting" ? "Verifying…" : "Confirm"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <form className={`flex flex-col gap-4 ${stacked ? "" : "sm:flex-row sm:gap-3"}`} onSubmit={handleSubmit}>
        <div className={stacked ? "space-y-2" : "relative flex-1"}>
          {stacked ? (
            <label htmlFor="newsletter-name" className="block text-sm font-medium text-ink">Name</label>
          ) : (
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
              <PersonIcon />
            </span>
          )}
          <input
            id="newsletter-name"
            name="name"
            type="text"
            required
            placeholder="Your name"
            className={`w-full border border-line bg-paper px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-ink ${stacked ? "rounded-xl" : "rounded-full pl-10"}`}
          />
        </div>
        <div className={stacked ? "space-y-2" : "relative flex-[1.2]"}>
          {stacked ? (
            <label htmlFor="newsletter-email" className="block text-sm font-medium text-ink">Email</label>
          ) : (
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
              <EnvelopeIcon />
            </span>
          )}
          <input
            id="newsletter-email"
            name="email"
            type="email"
            required
            placeholder="Email address"
            className={`w-full border border-line bg-paper px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-ink ${stacked ? "rounded-xl" : "rounded-full pl-10"}`}
          />
        </div>
        <button
          type="submit"
          disabled={status === "submitting" || !turnstileToken}
          className={`shrink-0 border bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50 ${stacked ? "w-full rounded-xl" : "rounded-full"} ${
            dark ? "border-white/30" : "border-transparent"
          }`}
        >
          {status === "submitting" ? "Sending code…" : "Subscribe Free"}
        </button>
      </form>
      <div className="mt-3">
        <Turnstile onToken={handleToken} dark={dark} />
      </div>
      {status === "error" && (
        <p className={`mt-2 text-sm ${dark ? "text-red-400" : "text-red-600"}`}>{error}</p>
      )}
      <p className={`mt-3 text-xs ${dark ? "text-white/60" : "text-ink-soft"}`}>No spam. Unsubscribe anytime.</p>
    </div>
  );
}
