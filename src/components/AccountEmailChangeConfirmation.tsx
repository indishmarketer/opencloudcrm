"use client";

import { useState } from "react";
import Link from "next/link";

export default function AccountEmailChangeConfirmation({ token }: { token: string }) {
  const [status, setStatus] = useState<"ready" | "working" | "done">("ready");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  async function confirm() {
    setStatus("working");
    setError("");
    try {
      const response = await fetch("/api/account/email/change/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "We could not change the email address.");
      setEmail(body.email);
      setStatus("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not change the email address.");
      setStatus("ready");
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold">
        {status === "done" ? "Email address changed" : "Confirm your new email address"}
      </h1>
      <p className="mt-3 text-ink-soft">
        {status === "done"
          ? `Your account now uses ${email}. You have been signed out everywhere. Log in again with the new address.`
          : "Confirming will update the email on your account and sign you out everywhere."}
      </p>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {status === "done" ? (
        <Link href="/login" className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper">
          Log in
        </Link>
      ) : (
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={confirm}
            disabled={status === "working" || !token}
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper disabled:opacity-50"
          >
            {status === "working" ? "Confirming..." : "Confirm new email"}
          </button>
          <Link href="/login" className="rounded-full border border-line px-6 py-3 text-sm font-medium">
            Cancel
          </Link>
        </div>
      )}
    </div>
  );
}
