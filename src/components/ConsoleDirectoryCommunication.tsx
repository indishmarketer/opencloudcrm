"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/ConfirmDialog";
import ConsoleEmailBuilder from "@/components/emailBuilder/ConsoleEmailBuilder";
import type { EmailBlock } from "@/lib/emailBlocks";

type DirectoryEmail = { key: string; label: string; when: string; vars: string[]; subject: string; body: string; blocks: EmailBlock[] | null; edited: boolean };

const VAR_LABELS: Record<string, string> = {
  first_name: "First name", tool_name: "Tool name", website_url: "Tool website", edit_url: "Edit submission link",
  tool_url: "Live listing link", manage_url: "My tools link", payment_url: "Payment link", note: "Your note",
  submitter_email: "Submitter email", event_text: "What happened", console_url: "Console review link", site_name: "Business name",
};

/** The tools directory's built-in emails. They always send on their own
 * when the event happens; here only their wording changes, in the same
 * composer used everywhere else. */
export default function ConsoleDirectoryCommunication({ businessName, businessAddress }: { businessName: string; businessAddress: string }) {
  const { confirm, dialog } = useConfirm();
  const [emails, setEmails] = useState<DirectoryEmail[] | null>(null);
  const [composing, setComposing] = useState<DirectoryEmail | null>(null);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState<{ key: string; text: string; error?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/console/directory/emails").then((r) => r.json()).then((body) => setEmails(body.emails || [])).catch(() => setNotice({ key: "", text: "Could not load the emails.", error: true }));
  }, []);

  function replace(next: DirectoryEmail) {
    setEmails((current) => current?.map((email) => (email.key === next.key ? next : email)) || null);
  }

  async function call(email: DirectoryEmail, method: "PUT" | "DELETE" | "POST", payload?: unknown) {
    setBusyKey(email.key); setNotice(null);
    const response = await fetch(`/api/console/directory/emails/${email.key}`, { method, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined }).catch(() => null);
    const result = await response?.json().catch(() => ({})) || {};
    setBusyKey("");
    return response?.ok ? result : { error: result.error || "Something went wrong." };
  }

  async function saveFromComposer(next: { subject: string; blocks: EmailBlock[] | null; bodyHtml: string }) {
    if (!composing) return { ok: false, error: "Nothing to save." };
    const result = await call(composing, "PUT", { subject: next.subject, body: next.bodyHtml, blocks: next.blocks });
    if (result.error) return { ok: false, error: result.error };
    replace({ ...composing, subject: result.subject, body: result.body, blocks: result.blocks, edited: result.edited });
    return { ok: true };
  }

  async function reset(email: DirectoryEmail) {
    if (!(await confirm({ message: `Go back to the built-in wording for "${email.label}"? Your edits to it are removed.`, confirmLabel: "Reset" }))) return;
    const result = await call(email, "DELETE");
    if (result.error) setNotice({ key: email.key, text: result.error, error: true });
    else { replace({ ...email, subject: result.subject, body: result.body, blocks: result.blocks, edited: false }); setNotice({ key: email.key, text: "Back to the built-in wording." }); }
  }

  async function sendTest(email: DirectoryEmail) {
    const result = await call(email, "POST");
    setNotice(result.error ? { key: email.key, text: result.error, error: true } : { key: email.key, text: `Test sent to ${result.sentTo}, with sample values.` });
  }

  return (
    <div className="max-w-3xl">
      <p className="text-sm leading-6 text-ink-soft">
        These emails are built in. Each one sends on its own when the event happens, from your{" "}
        <Link href="/console/email/sending" className="text-ink underline">Tools directory sender</Link> and with your business name.
        You can change what they say, but not when they send.
      </p>
      {notice && !notice.key && <p role="alert" className="mt-3 text-sm text-red-700">{notice.text}</p>}
      {!emails ? <p className="mt-6 text-sm text-ink-soft">Loading…</p> : (
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-paper">
          {emails.map((email) => (
            <div key={email.key} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">{email.label}<span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${email.edited ? "bg-paper-soft text-ink" : "text-ink-soft"}`}>{email.edited ? "Edited" : "Default"}</span></p>
                  <p className="mt-0.5 text-xs text-ink-soft">{email.when}</p>
                  <p className="mt-1 truncate text-sm text-ink-soft">Subject: {email.subject}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setComposing(email)} className="rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-paper">Open composer</button>
                  <button type="button" disabled={busyKey === email.key} onClick={() => void sendTest(email)} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium hover:border-ink disabled:opacity-50">Send me a test</button>
                  {email.edited && <button type="button" disabled={busyKey === email.key} onClick={() => void reset(email)} className="rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-soft hover:border-ink disabled:opacity-50">Reset</button>}
                </div>
              </div>
              {notice?.key === email.key && <p role={notice.error ? "alert" : "status"} className={`mt-2 text-sm ${notice.error ? "text-red-700" : "text-emerald-700"}`}>{notice.text}</p>}
            </div>
          ))}
        </div>
      )}
      {composing && <div className="fixed inset-0 z-[80] bg-paper">
        <ConsoleEmailBuilder
          key={composing.key}
          initialSubject={composing.subject}
          initialBlocks={composing.blocks || []}
          initialBodyHtml={composing.body}
          variables={composing.vars.map((token) => ({ token, label: VAR_LABELS[token] || token }))}
          documentName={composing.label}
          backHref="/console/directory?tab=communication"
          backLabel="Back to Communication"
          onBack={() => setComposing(null)}
          onSaved={() => setComposing(null)}
          businessName={businessName}
          businessAddress={businessAddress}
          onSave={saveFromComposer}
        />
      </div>}
      {dialog}
    </div>
  );
}
