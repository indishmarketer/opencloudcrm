"use client";

import { useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import { SENDER_PURPOSES, type EmailSettings, type SenderPurpose } from "@/lib/emailSettingsShape";

/** Deployment-level sending identity: the domain mail is sent from, the
 * usernames (the part before the @) available on it, and which username
 * each kind of email uses. Built-in emails (tools directory, account
 * emails, …) pick their address from here, so nothing is hardcoded to one
 * install's identity. */
export default function ConsoleEmailSending({ defaultDomain, settings: initial }: { defaultDomain: string; settings: EmailSettings }) {
  const [domain, setDomain] = useState(initial.sendingDomain);
  const [usernames, setUsernames] = useState(initial.usernames);
  const [senders, setSenders] = useState(initial.senders);
  const [newUsername, setNewUsername] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const domainShown = domain.trim() || defaultDomain;
  const dirty = JSON.stringify({ d: domain.trim(), u: usernames, s: senders }) !== JSON.stringify({ d: saved.sendingDomain, u: saved.usernames, s: saved.senders });

  function addUsername() {
    const value = newUsername.trim().toLowerCase().replace(/@.*$/, "");
    if (!value || usernames.includes(value)) { setNewUsername(""); return; }
    setUsernames([...usernames, value]);
    setNewUsername("");
  }
  function removeUsername(value: string) {
    setUsernames(usernames.filter((u) => u !== value));
    setSenders(Object.fromEntries(Object.entries(senders).map(([purpose, u]) => [purpose, u === value ? "" : u])) as Record<SenderPurpose, string>);
  }

  async function save() {
    setStatus("saving"); setError("");
    const res = await fetch("/api/console/email/sending-domain", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendingDomain: domain.trim(), usernames, senders }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setStatus("error"); setError(body.error || "Could not save."); return; }
    setSaved(body.settings); setDomain(body.settings.sendingDomain); setUsernames(body.settings.usernames); setSenders(body.settings.senders);
    setStatus("saved"); setTimeout(() => setStatus("idle"), 3000);
  }

  return (
    <div className="max-w-2xl space-y-5">
      <section className="rounded-2xl border border-line bg-paper p-5">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" htmlFor="email-sending-domain">Sending domain</label>
          <button type="button" onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo} aria-label="How to connect a sending domain" title="How to connect a sending domain" className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[11px] font-semibold text-ink-soft hover:border-ink hover:text-ink">i</button>
        </div>
        {showInfo && <div className="mt-3 space-y-2 rounded-xl bg-paper-soft p-3 text-sm leading-6 text-ink-soft">
          <p>The domain your emails are sent from, like <code>mail.example.com</code>. Leave it blank to use this site&apos;s own domain (<code>{defaultDomain}</code>).</p>
          <p>A custom domain must already be verified with your email provider (Amazon SES or Brevo), including its DNS/DKIM records. This field only chooses which domain is used. It doesn&apos;t verify it for you, and an unverified domain will fail or land in spam.</p>
        </div>}
        <input id="email-sending-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={defaultDomain} className="mt-3 w-full max-w-sm rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink" />
      </section>

      <section className="rounded-2xl border border-line bg-paper p-5">
        <p className="text-sm font-medium">Sending usernames</p>
        <p className="mt-1 text-sm text-ink-soft">The part before the @. Add the ones you send from, like support or hello.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {usernames.map((u) => <span key={u} className="inline-flex items-center gap-1.5 rounded-full border border-line py-1 pl-3 pr-1.5 text-sm">{u}@{domainShown}{usernames.length > 1 && <button type="button" onClick={() => removeUsername(u)} aria-label={`Remove ${u}`} className="rounded-full px-1.5 text-ink-soft hover:text-red-700">×</button>}</span>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center rounded-full border border-line bg-paper pr-4 text-sm focus-within:border-ink">
            <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUsername(); } }} placeholder="hello" aria-label="New username" className="w-28 rounded-full bg-transparent px-4 py-2 outline-none" />
            <span className="text-ink-soft">@{domainShown}</span>
          </span>
          <button type="button" onClick={addUsername} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">Add</button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-5">
        <p className="text-sm font-medium">Which address sends what</p>
        <p className="mt-1 text-sm text-ink-soft">Built-in emails use these. An email with its own From address set keeps it.</p>
        <div className="mt-4 space-y-3">
          {SENDER_PURPOSES.map((purpose) => (
            <div key={purpose.key} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
              <p className="text-sm">{purpose.label}</p>
              <BrandSelect value={senders[purpose.key] || usernames[0] || ""} onChange={(value) => setSenders({ ...senders, [purpose.key]: value })} options={usernames.map((u) => ({ value: u, label: `${u}@${domainShown}` }))} />
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={!dirty || status === "saving"} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50">{status === "saving" ? "Saving..." : "Save"}</button>
        {status === "saved" && <p className="text-sm text-emerald-700">Saved.</p>}
        {status === "error" && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
