"use client";

import { useCallback, useState } from "react";
import Turnstile from "@/components/Turnstile";

export default function ForgotPasswordForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const email = (e.currentTarget.elements.namedItem("email") as HTMLInputElement).value;

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong.");
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "done") {
    return (
      <p className="mt-10 text-sm text-ink-soft">
        If that email has an account, we&apos;ve sent a password reset link to it. Check your inbox.
      </p>
    );
  }

  return (
    <form className="mt-10 space-y-5" onSubmit={handleSubmit} method="POST">
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Turnstile onToken={handleToken} />
      <button
        type="submit"
        disabled={status === "submitting" || !turnstileToken}
        className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting" ? "Please wait…" : "Send reset link"}
      </button>
    </form>
  );
}
