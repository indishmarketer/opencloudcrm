"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ModeratorProfile } from "@/lib/community";

export default function ModeratorManager({ moderators }: { moderators: ModeratorProfile[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;

    try {
      const res = await fetch("/api/community/admin/moderators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
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

  async function handleRemove(username: string) {
    await fetch("/api/community/admin/moderators", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {moderators.map((m) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-4 py-2.5 text-sm"
          >
            <span>{m.name || m.username || m.email}</span>
            {m.username && (
              <button
                type="button"
                onClick={() => handleRemove(m.username!)}
                className="text-xs text-red-600 underline hover:text-red-700"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {moderators.length === 0 && <p className="text-sm text-ink-soft">No moderators yet.</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <input
          name="username"
          type="text"
          required
          placeholder="Username to make moderator"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
