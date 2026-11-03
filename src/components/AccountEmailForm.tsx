"use client";

import { useState } from "react";

export default function AccountEmailForm({ currentEmail }: { currentEmail: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/account/email/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not start the change.");
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Could not start the change.");
    }
  }

  if (status === "sent") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-green-700">Confirmation link sent</p>
        <p className="text-xs text-ink-soft">
          We sent a link to <strong>{email}</strong>. Open it to confirm your new email. Your account continues using {currentEmail} until then.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setEmail("");
            setIsEditing(false);
          }}
          className="text-xs font-medium underline underline-offset-2"
        >
          Cancel or use another address
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{currentEmail}</span>
        {!isEditing && (
          <button
            type="button"
            onClick={() => {
              setIsEditing(true);
              setError("");
            }}
            className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink hover:bg-paper"
          >
            Change email
          </button>
        )}
      </div>

      {isEditing && (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <input
            id="new-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="New email address"
            className="h-10 w-full rounded-lg border border-line bg-paper px-4 text-sm outline-none focus:border-ink"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={status === "saving" || !email.trim() || email.toLowerCase() === currentEmail.toLowerCase()}
              className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {status === "saving" ? "Sending link..." : "Send confirmation link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setError("");
                setEmail("");
              }}
              className="rounded-full border border-line px-4 py-2 text-xs font-medium hover:border-ink hover:bg-paper"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
