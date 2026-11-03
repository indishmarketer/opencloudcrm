"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MemberUsernameManager() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "done">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;
    const newUsername = (form.elements.namedItem("newUsername") as HTMLInputElement).value;

    try {
      const res = await fetch("/api/community/admin/members/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, newUsername }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      form.reset();
      setStatus("done");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <input
        name="username"
        type="text"
        required
        placeholder="Current username"
        className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
      />
      <input
        name="newUsername"
        type="text"
        required
        placeholder="New username"
        className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        Rename
      </button>
      {status === "done" && <p className="text-xs text-ink-soft">Renamed.</p>}
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
