"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BannedMember } from "@/lib/community";

export default function BanManager({ bans }: { bans: BannedMember[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;
    const reason = (form.elements.namedItem("reason") as HTMLInputElement).value;

    try {
      const res = await fetch("/api/community/admin/bans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      form.reset();
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleUnban(userId: number) {
    await fetch("/api/community/admin/bans", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {bans.map((b) => (
          <div
            key={b.user_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-4 py-2.5 text-sm"
          >
            <div>
              <span>{b.name || b.username}</span>
              {b.reason && <span className="ml-2 text-xs text-ink-soft">({b.reason})</span>}
            </div>
            <button
              type="button"
              onClick={() => handleUnban(b.user_id)}
              className="text-xs text-red-600 underline hover:text-red-700"
            >
              Unban
            </button>
          </div>
        ))}
        {bans.length === 0 && <p className="text-sm text-ink-soft">No banned members.</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <input
          name="username"
          type="text"
          required
          placeholder="Username to ban"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <input
          name="reason"
          type="text"
          placeholder="Reason (optional)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          Ban
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
