"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";
import type { ConsoleAdmin } from "@/lib/consoleAdmins";

export default function ConsoleAdminManager({ admins, ownerEmail }: { admins: ConsoleAdmin[]; ownerEmail: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;

    try {
      const res = await fetch("/api/console/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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

  async function handleRemove(email: string) {
    const ok = await confirm({
      message: `Remove ${email}'s console access? Their session is revoked immediately, not just future logins.`,
    });
    if (!ok) return;
    await fetch("/api/console/admins", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-paper-soft px-4 py-2.5 text-sm">
        <span className="font-medium">{ownerEmail}</span>
        <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Owner</span>
        <span className="ml-2 text-xs text-ink-soft">Can&apos;t be removed here, set via ADMIN_EMAIL.</span>
      </div>

      <div className="space-y-2">
        {admins.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg border border-line px-4 py-2.5 text-sm">
            <span>{a.email}</span>
            <button
              type="button"
              onClick={() => handleRemove(a.email)}
              className="text-xs text-red-600 underline hover:text-red-700"
            >
              Remove access
            </button>
          </div>
        ))}
        {admins.length === 0 && <p className="text-sm text-ink-soft">No other administrators invited.</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="admin@example.com"
          className="rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          Invite
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {dialog}
    </div>
  );
}
