"use client";

import { useState } from "react";
import Link from "next/link";

/** Its own tab (not bundled into Transactional emails) because this is
 * deployment-level infrastructure -- which domain mail claims to be from --
 * not per-template content. The per-template "Send from" address itself is
 * a free-text field on each template in the Transactional emails tab; this
 * page only controls the domain those addresses can use. */
export default function ConsoleEmailSending({ defaultDomain, sendingDomain }: { defaultDomain: string; sendingDomain: string }) {
  const [value, setValue] = useState(sendingDomain);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const dirty = value.trim() !== sendingDomain;

  async function save() {
    setStatus("saving");
    setError("");
    const res = await fetch("/api/console/email/sending-domain", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendingDomain: value.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus("error");
      setError(body.error || "Could not save the sending domain.");
      return;
    }
    setValue(body.settings?.sendingDomain ?? value.trim());
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 3000);
  }

  return (
    <div className="max-w-2xl rounded-2xl border border-line bg-paper p-5">
      <label className="text-sm font-medium" htmlFor="email-sending-domain">Sending domain</label>
      <p className="mt-1 text-sm text-ink-soft">
        The domain outgoing emails are sent from (e.g. <code>mail.example.com</code>). Leave this blank to use this
        site&apos;s own domain (<code>{defaultDomain}</code>). A custom domain here must already be verified with
        your email provider (SES or Brevo) -- this field only changes which domain is used, it doesn&apos;t verify
        DNS/DKIM for you.
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        This only sets the domain. The username/local part (the bit before the @) is yours to choose freely on
        each individual email, in the <Link href="/console/email/templates" className="underline">Transactional emails</Link> tab --
        there is no fixed list of usernames to pick from.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          id="email-sending-domain"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={defaultDomain}
          className="w-64 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={save}
          disabled={!dirty || status === "saving"}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {status === "saving" ? "Saving..." : "Save"}
        </button>
        {status === "saved" && <p className="text-xs text-emerald-700">Saved.</p>}
        {status === "error" && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
