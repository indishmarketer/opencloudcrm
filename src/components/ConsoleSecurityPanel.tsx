"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/console/security", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = await res?.json().catch(() => ({}));
  return { ok: !!res?.ok, data: data || {} };
}

export default function ConsoleSecurityPanel({
  enabled,
  enabledAt,
  recoveryLeft,
  team,
}: {
  enabled: boolean;
  enabledAt: string | null;
  recoveryLeft: number;
  team: { email: string; enabled: boolean }[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [action, setAction] = useState<"regenerate" | "reset-self" | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [teamError, setTeamError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!action) return;
    setBusy(true);
    setError("");
    const { ok, data } = await post({ action, code });
    setBusy(false);
    if (!ok) {
      setError(data.error || "Something went wrong. Try again.");
      return;
    }
    setCode("");
    setAction(null);
    if (Array.isArray(data.recoveryCodes)) setCodes(data.recoveryCodes);
    else setMessage("Done. Your next console login will ask you to scan a new QR code.");
    router.refresh();
  }

  async function resetTeamMember(email: string) {
    if (!(await confirm({ message: `Reset 2-step login for ${email}? Their next login will ask them to set up their authenticator again.`, confirmLabel: "Reset" }))) return;
    setTeamError("");
    const { ok, data } = await post({ action: "reset", email });
    if (!ok) setTeamError(data.error || "Could not reset. Try again.");
    else router.refresh();
  }

  return (
    <div className="mt-8 space-y-6">
      {dialog}
      <section className="rounded-2xl border border-line bg-paper p-5">
        <h2 className="font-medium">Your 2-step login</h2>
        {enabled ? (
          <p className="mt-1 text-sm text-ink-soft">
            On since {enabledAt}. {recoveryLeft} recovery code{recoveryLeft === 1 ? "" : "s"} left.
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">Not set up yet. You&apos;ll be asked to set it up at your next login.</p>
        )}

        {codes && (
          <div className="mt-4">
            <p className="text-sm">New recovery codes. Save them now; the old ones no longer work and these won&apos;t be shown again.</p>
            <ul className="mt-3 grid select-all grid-cols-2 gap-2 rounded-xl border border-line p-4 font-mono text-sm">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {message && <p className="mt-4 text-sm">{message}</p>}

        {enabled && !action && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setAction("regenerate"); setCodes(null); setMessage(""); }} className="rounded-full border border-line px-4 py-1.5 text-xs font-medium hover:border-ink">
              Create new recovery codes
            </button>
            <button type="button" onClick={() => { setAction("reset-self"); setCodes(null); setMessage(""); }} className="rounded-full border border-line px-4 py-1.5 text-xs font-medium hover:border-ink">
              Moving to a new phone
            </button>
          </div>
        )}

        {action && (
          <form onSubmit={submit} className="mt-4 flex flex-wrap items-start gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={action === "regenerate" ? "6-digit code" : "Code or recovery code"}
              aria-label={action === "regenerate" ? "Current 6-digit code" : "Current code or a recovery code"}
              autoComplete="one-time-code"
              required
              autoFocus
              className="w-44 rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-sm outline-none focus:border-ink"
            />
            <button type="submit" disabled={busy} className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper hover:opacity-80 disabled:opacity-50">
              {busy ? "Checking…" : action === "regenerate" ? "Create codes" : "Reset my authenticator"}
            </button>
            <button type="button" onClick={() => { setAction(null); setError(""); setCode(""); }} className="px-2 py-1.5 text-xs text-ink-soft hover:text-ink">
              Cancel
            </button>
            {error && <p className="w-full text-sm text-red-600">{error}</p>}
          </form>
        )}
      </section>

      {team.length > 0 && (
        <section className="rounded-2xl border border-line bg-paper p-5">
          <h2 className="font-medium">Team</h2>
          <p className="mt-1 text-sm text-ink-soft">If a team member loses their phone and recovery codes, reset their 2-step login here.</p>
          <ul className="mt-4 divide-y divide-line text-sm">
            {team.map((member) => (
              <li key={member.email} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{member.email}</span>
                <span className="flex items-center gap-3">
                  <span className="text-ink-soft">{member.enabled ? "On" : "Not set up"}</span>
                  {member.enabled && (
                    <button type="button" onClick={() => resetTeamMember(member.email)} className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-ink">
                      Reset
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {teamError && <p className="mt-2 text-sm text-red-600">{teamError}</p>}
        </section>
      )}
    </div>
  );
}
