"use client";

import { useCallback, useState } from "react";
import Turnstile from "@/components/Turnstile";

type Step = "idle" | "submitting" | "verify" | "success" | "error";

export default function NewsletterSignupForm() {
  const [step, setStep] = useState<Step>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleToken = useCallback((t: string) => setToken(t), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStep("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), turnstileToken: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setStep("error");
        return;
      }
      setStep("verify");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStep("error");
    }
  }

  if (step === "verify" || step === "success") {
    return (
      <div className="rounded-2xl border border-line bg-paper p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper-soft">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h3 className="font-display text-xl font-semibold">Check your inbox</h3>
        <p className="mt-2 text-sm text-ink-soft">
          We sent a confirmation link to <strong className="text-ink">{email}</strong>. Click it
          to confirm your subscription and start receiving the newsletter.
        </p>
        <p className="mt-3 text-xs text-ink-soft">
          Can&apos;t find it? Check your spam or promotions folder.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="nl-name" className="sr-only">Your name</label>
        <input
          id="nl-name"
          type="text"
          autoComplete="given-name"
          placeholder="Your first name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={step === "submitting"}
          className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none transition focus:border-ink disabled:opacity-60"
        />
      </div>
      <div>
        <label htmlFor="nl-email" className="sr-only">Email address</label>
        <input
          id="nl-email"
          type="email"
          autoComplete="email"
          placeholder="Your email address"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={step === "submitting"}
          className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none transition focus:border-ink disabled:opacity-60"
        />
      </div>

      <Turnstile onToken={handleToken} />

      {errorMsg && (
        <p role="alert" className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={step === "submitting" || !token}
        className="w-full rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {step === "submitting" ? "Subscribing…" : "Subscribe for free →"}
      </button>

      <p className="text-center text-xs text-ink-soft">
        Free forever. Unsubscribe any time. No spam, ever.
      </p>
    </form>
  );
}
