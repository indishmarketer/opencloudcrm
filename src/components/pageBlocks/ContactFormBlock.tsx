"use client";

import { useCallback, useState } from "react";
import Turnstile from "@/components/Turnstile";
import UpdatesOptIn from "@/components/UpdatesOptIn";
import { trackEvent } from "@/lib/gtag";

/** The contact form section of the page builder: request a code, then
 * confirm it (keeps the inbox spam-free). Headings and labels come from the
 * section's settings; `aside` is the server-rendered contact details. */
export default function ContactFormBlock({
  heading,
  text,
  messageLabel,
  successHeading,
  successText,
  aside,
}: {
  heading: string;
  text: string;
  messageLabel: string;
  successHeading: string;
  successText: string;
  aside: React.ReactNode;
}) {
  const [step, setStep] = useState<"form" | "otp" | "done">("form");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [updatesOptIn, setUpdatesOptIn] = useState(true);
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

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
        body: JSON.stringify({ ...data, updatesOptIn, turnstileToken }),
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
      trackEvent("generate_lead", { form: "contact" });
      setStep("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Incorrect code.");
    } finally {
      setStatus("idle");
    }
  }

  if (step === "done") {
    return (
      <div className="max-w-2xl">
        <h2 className="font-display text-4xl font-semibold">{successHeading}</h2>
        {successText && <p className="mt-3 text-ink-soft">{successText}</p>}
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="mx-auto max-w-md">
        <h2 className="font-display text-3xl font-semibold">Check your email</h2>
        <p className="mt-3 text-ink-soft">
          We sent a link to {formData.email} — click &ldquo;Confirm now&rdquo; in that email, or
          enter the 6-digit code below. Either one confirms you&apos;re a real person, this keeps
          our inbox spam-free.
        </p>
        <form className="mt-8 space-y-4" onSubmit={handleVerify}>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
            className="w-full rounded-lg border border-line bg-paper px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-ink"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {status === "submitting" ? "Verifying…" : "Confirm and send"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={`grid gap-12 ${aside ? "lg:grid-cols-[1.2fr_1fr]" : "max-w-2xl"}`}>
      <div>
      {heading && <h1 className="font-display text-4xl font-semibold">{heading}</h1>}
      {text && <p className="mt-3 whitespace-pre-line text-ink-soft">{text}</p>}
      <form className="mt-10 space-y-5" onSubmit={handleRequestOtp}>
        <div>
          <label className="text-sm font-medium" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="message">
            {messageLabel}
          </label>
          <textarea
            id="message"
            name="message"
            rows={5}
            required
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
          />
        </div>
        <UpdatesOptIn checked={updatesOptIn} onChange={setUpdatesOptIn} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Turnstile onToken={handleToken} />
        <button
          type="submit"
          disabled={status === "submitting" || !turnstileToken}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {status === "submitting" ? "Sending code…" : "Send message"}
        </button>
      </form>
      </div>
      {aside}
    </div>
  );
}
