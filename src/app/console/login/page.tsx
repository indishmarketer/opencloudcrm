"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SITE_HOSTNAME } from "@/config/brand";

function LoginForm() {
  const searchParams = useSearchParams();
  const expired = searchParams.get("error") === "expired";
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const email = (e.currentTarget.elements.namedItem("email") as HTMLInputElement).value;
    try {
      const res = await fetch("/api/console/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong.");
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "sent") {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 text-center">
        <h1 className="font-display text-2xl font-semibold">Check your email</h1>
        <p className="mt-3 text-sm text-ink-soft">
          If that address is authorized, a login link is on its way. It expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-2xl font-semibold">Console</h1>
      {expired && (
        <p className="mt-3 text-sm text-red-600">
          That link expired or was already used. Request a new one below.
        </p>
      )}
      {status === "error" && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <input
          name="email"
          type="email"
          placeholder={`you@${SITE_HOSTNAME}`}
          required
          className="w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {status === "submitting" ? "Sending…" : "Send login link"}
        </button>
      </form>
    </div>
  );
}

export default function ConsoleLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
