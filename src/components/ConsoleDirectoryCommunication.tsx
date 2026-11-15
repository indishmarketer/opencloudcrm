"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/ConfirmDialog";
import { wrapEmailHtml } from "@/lib/emailShell";

type DirectoryEmail = { key: string; label: string; when: string; vars: string[]; subject: string; body: string; edited: boolean };

/** The tools directory's built-in emails. They always send on their own
 * when the event happens; here you can only change their wording. */
export default function ConsoleDirectoryCommunication() {
  const [emails, setEmails] = useState<DirectoryEmail[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/console/directory/emails").then((r) => r.json()).then((body) => setEmails(body.emails || [])).catch(() => setError("Could not load the emails."));
  }, []);

  function replace(next: DirectoryEmail) {
    setEmails((current) => current?.map((email) => (email.key === next.key ? next : email)) || null);
  }

  return (
    <div className="max-w-3xl">
      <p className="text-sm leading-6 text-ink-soft">
        These emails are built in. Each one sends on its own when the event happens, from your{" "}
        <Link href="/console/email/sending" className="text-ink underline">Tools directory sender</Link> and with your business name.
        You can change what they say, but not when they send.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
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
                <button type="button" onClick={() => setOpenKey(openKey === email.key ? null : email.key)} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium hover:border-ink">{openKey === email.key ? "Close" : "Edit"}</button>
              </div>
              {openKey === email.key && <EmailEditor email={email} onSaved={replace} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailEditor({ email, onSaved }: { email: DirectoryEmail; onSaved: (email: DirectoryEmail) => void }) {
  const { confirm, dialog } = useConfirm();
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty = subject !== email.subject || body !== email.body;

  async function call(method: "PUT" | "DELETE" | "POST", payload?: unknown) {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch(`/api/console/directory/emails/${email.key}`, { method, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined }).catch(() => null);
    const result = await response?.json().catch(() => ({})) || {};
    setBusy(false);
    if (!response?.ok) { setError(result.error || "Something went wrong."); return null; }
    return result;
  }
  async function save() {
    const result = await call("PUT", { subject, body });
    if (result) { onSaved({ ...email, subject: result.subject, body: result.body, edited: result.edited }); setMessage("Saved. New emails use this wording."); }
  }
  async function reset() {
    if (!(await confirm({ message: "Go back to the built-in wording? Your edits to this email are removed.", confirmLabel: "Reset" }))) return;
    const result = await call("DELETE");
    if (result) { setSubject(result.subject); setBody(result.body); onSaved({ ...email, subject: result.subject, body: result.body, edited: false }); setMessage("Back to the built-in wording."); }
  }
  async function sendTest() {
    if (dirty) { setError("Save first. The test sends the saved version."); return; }
    const result = await call("POST");
    if (result) setMessage(`Test sent to ${result.sentTo}, with sample values.`);
  }
  function insertVar(name: string) {
    const area = bodyRef.current;
    const token = `{{${name}}}`;
    if (!area) { setBody((current) => current + token); return; }
    const { selectionStart, selectionEnd } = area;
    setBody(body.slice(0, selectionStart) + token + body.slice(selectionEnd));
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(selectionStart + token.length, selectionStart + token.length); });
  }

  return (
    <div className="mt-4 space-y-3">
      <label className="block text-xs font-medium text-ink-soft">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>
      <div>
        <p className="text-xs font-medium text-ink-soft">Fill-ins (click to add at the cursor)</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{email.vars.map((name) => <button key={name} type="button" onClick={() => insertVar(name)} className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px] hover:border-ink">{`{{${name}}}`}</button>)}</div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block text-xs font-medium text-ink-soft">Message (HTML)<textarea ref={bodyRef} value={body} onChange={(event) => setBody(event.target.value)} rows={14} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-mono text-xs text-ink outline-none focus:border-ink" /></label>
        <div><p className="text-xs font-medium text-ink-soft">Preview</p><iframe title={`${email.label} preview`} sandbox="" srcDoc={wrapEmailHtml(body)} className="mt-1.5 h-[17.5rem] w-full rounded-lg border border-line bg-white" /></div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">Save</button>
        <button type="button" disabled={busy} onClick={() => void sendTest()} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink disabled:opacity-50">Send me a test</button>
        {email.edited && <button type="button" disabled={busy} onClick={() => void reset()} className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft hover:border-ink disabled:opacity-50">Reset to default</button>}
      </div>
      {dialog}
    </div>
  );
}
