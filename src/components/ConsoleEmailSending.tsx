"use client";

import { useState } from "react";
import Link from "next/link";
import type { EmailSettings } from "@/lib/emailSettingsShape";

/** Its own tab (not bundled into Library) because this is deployment-level
 * infrastructure -- which domain mail claims to be from, and how every
 * email is branded -- not per-template content. The per-template "Send
 * from" address itself is a free-text field on each fixed email in the
 * Library tab; this page only controls the domain those addresses can use
 * and the shared chrome every email gets wrapped in. */
export default function ConsoleEmailSending({ defaultDomain, settings }: { defaultDomain: string; settings: EmailSettings }) {
  const [savedDomain, setSavedDomain] = useState(settings.sendingDomain);
  const [domain, setDomain] = useState(settings.sendingDomain);
  const [domainStatus, setDomainStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [domainError, setDomainError] = useState("");
  const domainDirty = domain.trim() !== savedDomain;

  const [savedBranding, setSavedBranding] = useState(settings);
  const [brandingEnabled, setBrandingEnabled] = useState(settings.brandingEnabled);
  const [brandingAlign, setBrandingAlign] = useState(settings.brandingAlign);
  const [accentColor, setAccentColor] = useState(settings.brandingAccentColor);
  const [backgroundColor, setBackgroundColor] = useState(settings.brandingBackgroundColor);
  const [brandingStatus, setBrandingStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [brandingError, setBrandingError] = useState("");
  const brandingDirty = brandingEnabled !== savedBranding.brandingEnabled
    || brandingAlign !== savedBranding.brandingAlign
    || accentColor !== savedBranding.brandingAccentColor
    || backgroundColor !== savedBranding.brandingBackgroundColor;

  async function saveDomain() {
    setDomainStatus("saving");
    setDomainError("");
    const res = await fetch("/api/console/email/sending-domain", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendingDomain: domain.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDomainStatus("error");
      setDomainError(body.error || "Could not save the sending domain.");
      return;
    }
    const newDomain = body.settings?.sendingDomain ?? domain.trim();
    setDomain(newDomain);
    setSavedDomain(newDomain);
    setDomainStatus("saved");
    setTimeout(() => setDomainStatus("idle"), 3000);
  }

  async function saveBranding() {
    setBrandingStatus("saving");
    setBrandingError("");
    const res = await fetch("/api/console/email/sending-domain", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandingEnabled,
        brandingAlign,
        brandingAccentColor: accentColor,
        brandingBackgroundColor: backgroundColor,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBrandingStatus("error");
      setBrandingError(body.error || "Could not save branding.");
      return;
    }
    setSavedBranding({ ...savedBranding, brandingEnabled, brandingAlign, brandingAccentColor: accentColor, brandingBackgroundColor: backgroundColor });
    setBrandingStatus("saved");
    setTimeout(() => setBrandingStatus("idle"), 3000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-line bg-paper p-5">
        <label className="text-sm font-medium" htmlFor="email-sending-domain">Sending domain</label>
        <p className="mt-1 text-sm text-ink-soft">
          The domain outgoing emails are sent from (e.g. <code>mail.example.com</code>). Leave this blank to use this
          site&apos;s own domain (<code>{defaultDomain}</code>). A custom domain here must already be verified with
          your email provider (SES or Brevo) -- this field only changes which domain is used, it doesn&apos;t verify
          DNS/DKIM for you.
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          This only sets the domain. The username/local part (the bit before the @) is yours to choose freely on
          each individual email, in the <Link href="/console/email/library" className="underline">Library</Link> tab --
          there is no fixed list of usernames to pick from.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            id="email-sending-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={defaultDomain}
            className="w-64 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={saveDomain}
            disabled={!domainDirty || domainStatus === "saving"}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {domainStatus === "saving" ? "Saving..." : "Save"}
          </button>
          {domainStatus === "saved" && <p className="text-xs text-emerald-700">Saved.</p>}
          {domainStatus === "error" && <p className="text-xs text-red-600">{domainError}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-paper p-5">
        <label className="text-sm font-medium">Branding</label>
        <p className="mt-1 text-sm text-ink-soft">
          The header strip, accent line, and page background every email is wrapped in before sending. Turn it off
          entirely if you&apos;d rather design your own header inside the email itself (Visual or HTML mode in the
          composer) -- the viewport/dark-mode-safety wrapper and the unsubscribe footer always stay, only this
          visual chrome is optional.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={brandingEnabled}
            onChange={(e) => setBrandingEnabled(e.target.checked)}
            className="rounded border-line accent-ink"
          />
          Show the brand header and accent line
        </label>
        {brandingEnabled && (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-ink-soft" htmlFor="branding-align">Header alignment</label>
              <select
                id="branding-align"
                value={brandingAlign}
                onChange={(e) => setBrandingAlign(e.target.value === "center" ? "center" : "left")}
                className="mt-1 block rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-soft" htmlFor="branding-accent">Accent color</label>
              <input
                id="branding-accent"
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="mt-1 block h-10 w-16 rounded-lg border border-line bg-paper"
              />
            </div>
            <div>
              <label className="text-xs text-ink-soft" htmlFor="branding-bg">Page background</label>
              <input
                id="branding-bg"
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="mt-1 block h-10 w-16 rounded-lg border border-line bg-paper"
              />
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveBranding}
            disabled={!brandingDirty || brandingStatus === "saving"}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {brandingStatus === "saving" ? "Saving..." : "Save"}
          </button>
          {brandingStatus === "saved" && <p className="text-xs text-emerald-700">Saved.</p>}
          {brandingStatus === "error" && <p className="text-xs text-red-600">{brandingError}</p>}
        </div>
      </div>
    </div>
  );
}
