"use client";

import { useState } from "react";
import {
  buildLegalLine,
  formatAddressOneLine,
  type BusinessAddress,
  type BusinessPolicies,
  type BusinessProfile,
} from "@/lib/businessProfileShape";

const inputClass =
  "w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm font-normal outline-none transition focus:border-ink";

function Field({
  label,
  hint,
  value,
  onChange,
  type = "text",
  list,
  placeholder,
  wide,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  list?: string;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-ink ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <input
        type={type}
        value={value}
        list={list}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      {hint && <span className="text-xs font-normal text-ink-soft">{hint}</span>}
    </label>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-paper-soft p-6">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Business identity editor: everything the footer, Contact/About blocks,
 * legal pages and search-engine schema show about the business. Every
 * field is optional; anything left blank is simply not shown. */
export default function ConsoleBusinessProfile({
  initialProfile,
  source,
  siteName,
}: {
  initialProfile: BusinessProfile;
  source: "database" | "environment" | "empty";
  siteName: string;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [currentSource, setCurrentSource] = useState(source);

  const set = <K extends keyof BusinessProfile>(key: K) => (value: BusinessProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));
  const setAddress = (key: keyof BusinessAddress) => (value: string) =>
    setProfile((p) => ({ ...p, address: { ...p.address, [key]: value } }));
  const setPolicy = (key: keyof BusinessPolicies) => (value: string) =>
    setProfile((p) => ({ ...p, policies: { ...p.policies, [key]: value } }));

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/console/business-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setProfile(data.profile);
      setCurrentSource("database");
      setMessage("Saved. The footer, contact details and legal pages update within a few seconds.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const brand = profile.legalName.trim() || siteName;
  const legalPreview = buildLegalLine(profile, brand);
  const addressPreview = formatAddressOneLine(profile.address);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl text-ink">Business details</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Shown in the footer, on contact sections, on the Terms, Privacy and Refund pages, and to search engines.
          Leave anything blank to hide it.
        </p>
      </div>

      {currentSource === "environment" && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          These details are still coming from the old <code>BUSINESS_*</code> environment variables. Click Save once
          to move them here. After that you can delete those variables from your hosting settings.
        </p>
      )}
      {currentSource === "empty" && (
        <p className="rounded-xl bg-paper-soft p-4 text-sm text-ink-soft">
          Nothing filled in yet, so the site shows no address, phone or legal line. Fill in what applies to your business.
        </p>
      )}

      <datalist id="registration-labels">
        <option value="Udyam Registration" />
        <option value="GSTIN" />
        <option value="EIN" />
        <option value="Company number" />
        <option value="VAT number" />
        <option value="ABN" />
        <option value="Business number" />
      </datalist>
      <datalist id="entity-types">
        <option value="sole proprietorship" />
        <option value="partnership" />
        <option value="LLC" />
        <option value="private limited company" />
        <option value="corporation" />
      </datalist>

      <Section title="Who runs the business" description="The legal identity behind the site.">
        <Field label="Legal or trading name" value={profile.legalName} onChange={set("legalName")} placeholder={siteName} hint="Blank uses the site name." />
        <Field label="Owner name" value={profile.ownerName} onChange={set("ownerName")} />
        <Field label="Type of business" value={profile.entityType} onChange={set("entityType")} list="entity-types" placeholder="e.g. LLC" />
        <div className="hidden sm:block" />
        <Field label="Registration label" value={profile.registrationLabel} onChange={set("registrationLabel")} list="registration-labels" placeholder="e.g. EIN, Company number" hint="Whatever your country calls it. Leave blank if you have none." />
        <Field label="Registration number" value={profile.registrationNumber} onChange={set("registrationNumber")} />
        <label className="grid gap-1.5 text-sm font-medium text-ink sm:col-span-2">
          Legal line (optional, replaces the generated one)
          <textarea
            value={profile.legalLineOverride}
            onChange={(e) => set("legalLineOverride")(e.target.value)}
            rows={2}
            maxLength={600}
            className={inputClass}
          />
          <span className="text-xs font-normal text-ink-soft">
            Shown in the footer and legal pages: {legalPreview ? <em>&ldquo;{legalPreview}&rdquo;</em> : "nothing (all fields above are blank)."}
          </span>
        </label>
        <Field label="Author page for the founder" value={profile.founderSlug} onChange={set("founderSlug")} placeholder="e.g. jane-doe" hint="Slug of an /author/... page. Links the founder in search-engine data." wide />
      </Section>

      <Section title="Contact" description="How customers reach you.">
        <Field label="Contact email" type="email" value={profile.email} onChange={set("email")} hint="Also the reply-to address for emails the site sends." />
        <Field label="Second email (optional)" type="email" value={profile.secondaryEmail} onChange={set("secondaryEmail")} />
        <Field label="Phone" value={profile.phone} onChange={set("phone")} placeholder="+1 555 0100" />
        <Field label="Business hours" value={profile.hours} onChange={set("hours")} placeholder="Mon-Fri, 9:00 AM - 5:00 PM" />
      </Section>

      <Section title="Address" description="Your registered or trading address.">
        <Field label="Address line 1" value={profile.address.line1} onChange={setAddress("line1")} wide />
        <Field label="Address line 2" value={profile.address.line2} onChange={setAddress("line2")} wide />
        <Field label="City" value={profile.address.city} onChange={setAddress("city")} />
        <Field label="County / district" value={profile.address.region} onChange={setAddress("region")} />
        <Field label="State / province" value={profile.address.state} onChange={setAddress("state")} />
        <Field label="Postal code" value={profile.address.postalCode} onChange={setAddress("postalCode")} />
        <Field label="Country" value={profile.address.country} onChange={setAddress("country")} />
        <Field label="Country code" value={profile.address.countryCode} onChange={setAddress("countryCode")} placeholder="US" hint="Two letters, for search engines." />
        <Field label="Short address for the footer (optional)" value={profile.addressShort} onChange={set("addressShort")} hint={addressPreview ? `Full address: ${addressPreview}` : undefined} wide />
      </Section>

      <Section title="Policy details" description="Numbers the Terms, Privacy and Refund pages quote.">
        <Field label="Refund window (days)" value={profile.policies.refundWindowDays} onChange={setPolicy("refundWindowDays")} />
        <Field label="Refund processing time (business days)" value={profile.policies.refundProcessingDays} onChange={setPolicy("refundProcessingDays")} placeholder="5-7" />
        <Field label="Minimum age" value={profile.policies.minAge} onChange={setPolicy("minAge")} />
        <Field label="Policies last updated" value={profile.policies.lastUpdated} onChange={setPolicy("lastUpdated")} placeholder="January 1, 2027" />
        <Field label="Governing law: country" value={profile.policies.governingLawCountry} onChange={setPolicy("governingLawCountry")} hint="Blank uses your address country." />
        <Field label="Governing law: courts of" value={profile.policies.governingLawJurisdiction} onChange={setPolicy("governingLawJurisdiction")} hint="Blank uses your state and country." />
      </Section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save business details"}
        </button>
        {message && <p className="text-sm text-ink-soft">{message}</p>}
      </div>
    </div>
  );
}
