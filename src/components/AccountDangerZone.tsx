"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";
import { useConfirm } from "@/components/ConfirmDialog";

export default function AccountDangerZone() {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function startDelete() {
    const ok = await confirm({
      message:
        "Delete your account? Your course access, community posts (kept but anonymized), payment records, and everything else tied to your account will be handled per our privacy policy. This can't be undone.",
      confirmLabel: "Continue",
    });
    if (ok) {
      setError("");
      setPassword("");
      setShowPasswordModal(true);
    }
  }

  async function confirmDelete() {
    if (!password) return;
    setDeleting(true);
    setError("");
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDeleting(false);
      setError(body.error || "Something went wrong.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-paper-soft p-6">
      <h3 className="font-medium">Your data</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Download everything tied to your account, or delete your account permanently.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /api/account/export is a file download, not a page; the catch-all src/app/[...slug]/page.tsx just makes the linter think every path is one */}
        <a
          href="/api/account/export"
          className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink hover:bg-paper"
        >
          Download my data
        </a>
        <button
          type="button"
          onClick={startDelete}
          className="rounded-full border border-red-600 px-5 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          Delete my account
        </button>
      </div>

      {showPasswordModal && (
        <ConsoleModal title="Confirm your password" onClose={() => !deleting && setShowPasswordModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">Enter your password one more time to permanently delete your account.</p>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={confirmDelete}
              disabled={!password || deleting}
              className="w-full rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Permanently delete my account"}
            </button>
          </div>
        </ConsoleModal>
      )}
      {dialog}
    </div>
  );
}
