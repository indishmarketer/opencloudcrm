"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Turnstile from "@/components/Turnstile";
import { trackEvent } from "@/lib/gtag";

const SHOWN_KEY = "im_newsletter_shown";

export default function NewsletterPopup() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<"form" | "otp" | "done">("form");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);
  const shownRef = useRef(false);

  const show = useCallback(() => {
    if (shownRef.current) return;
    if (sessionStorage.getItem(SHOWN_KEY)) return;
    shownRef.current = true;
    sessionStorage.setItem(SHOWN_KEY, "1");
    setVisible(true);
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(SHOWN_KEY)) return;
    const timer = setTimeout(show, 5000);
    function onMouseLeave(e: MouseEvent) {
      if (e.clientY <= 0) show();
    }
    document.addEventListener("mouseleave", onMouseLeave);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [show]);

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
        body: JSON.stringify({ name, email: emailValue, source: "blog-popup", turnstileToken }),
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
      trackEvent("generate_lead", { form: "newsletter" });
      setStep("done");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Incorrect code.");
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="relative w-full max-w-md rounded-2xl bg-paper p-8 shadow-lg">
        <button
          onClick={() => setVisible(false)}
          aria-label="Close"
          className="absolute right-4 top-4 text-ink-soft hover:text-ink"
        >
          &times;
        </button>

        {step === "done" && (
          <div className="text-center">
            <p className="font-display text-lg font-semibold">You&apos;re confirmed.</p>
            <p className="mt-2 text-sm text-ink-soft">Check your inbox for the next issue.</p>
          </div>
        )}

        {step === "form" && (
          <>
            <p className="font-display text-lg font-semibold">Get the free newsletter</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Tools and automations I build, open source, plus occasional free
              trials, straight to your inbox. No spam, we verify every
              subscriber so it stays a real list of real people.
            </p>
            <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
              <input
                name="name"
                type="text"
                required
                placeholder="Your name"
                className="w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
              />
              <input
                name="email"
                type="email"
                required
                placeholder="you@email.com"
                className="w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
              />
              {status === "error" && <p className="text-sm text-red-600">{error}</p>}
              <Turnstile onToken={handleToken} />
              <button
                type="submit"
                disabled={status === "submitting" || !turnstileToken}
                className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {status === "submitting" ? "Sending code…" : "Subscribe"}
              </button>
            </form>
          </>
        )}

        {step === "otp" && (
          <>
            <p className="font-display text-lg font-semibold">Check your email</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              We sent a link to {email} — click &ldquo;Confirm now&rdquo; in that email, or enter
              the 6-digit code below. Either one confirms you&apos;re a real person, not a bot.
            </p>
            <form className="mt-5 space-y-3" onSubmit={handleVerify}>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                required
                placeholder="123456"
                className="w-full rounded-lg border border-line bg-paper px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-ink"
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
          </>
        )}
      </div>
    </div>
  );
}
