"use client";

import { useRef, useState } from "react";
import MediaLibraryPicker from "@/components/MediaLibraryPicker";
import type { SiteIdentity } from "@/lib/siteIdentityShape";

const inputClass =
  "w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm font-normal outline-none transition focus:border-ink";
const smallButton =
  "rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink disabled:opacity-40";

function Field({
  label,
  hint,
  value,
  onChange,
  type = "text",
  placeholder,
  wide,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-ink ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      {hint && <span className="text-xs font-normal text-ink-soft">{hint}</span>}
    </label>
  );
}

/** Upload + browse + preview for one image URL, reusing the media library. */
function ImageField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/console/site-identity/upload", { method: "POST", body: form }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setUploading(false);
    if (!res?.ok) {
      setError(body.error || "Upload failed.");
      return;
    }
    onChange(body.url);
  }

  return (
    <div className="grid gap-1.5 sm:col-span-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="flex items-center gap-3">
        {value && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary R2 URL, no fixed dimensions
          <img src={value} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-line bg-paper-soft object-contain p-1" />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… or upload" className={inputClass} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={`${smallButton} shrink-0`}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <button type="button" onClick={() => setPicking(true)} className={`${smallButton} shrink-0`}>
            Browse library
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className={`${smallButton} shrink-0`}>
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {hint && <span className="text-xs font-normal text-ink-soft">{hint}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
      {picking && (
        <MediaLibraryPicker
          onSelect={(url) => {
            onChange(url);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
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

/** Site identity editor: the name, browser-tab title, meta description,
 * logo, favicon and social image. Every field is optional -- leave it blank
 * to keep the built-in default (the deployed SITE_NAME and brand assets). */
export default function ConsoleSiteIdentity({
  initialIdentity,
  defaultName,
}: {
  initialIdentity: SiteIdentity;
  defaultName: string;
}) {
  const [identity, setIdentity] = useState(initialIdentity);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const set = (key: keyof SiteIdentity) => (value: string) => setIdentity((i) => ({ ...i, [key]: value }));

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/console/site-identity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identity),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setIdentity(data.identity);
      setMessage("Saved. The site name, title, favicon and logo update within a few seconds.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const shownName = identity.name.trim() || defaultName;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl text-ink">Site identity</h2>
        <p className="mt-1 text-sm text-ink-soft">
          The name, browser-tab title and description visitors and search engines see, plus the logo and favicon.
          Leave anything blank to keep the built-in default ({defaultName}).
        </p>
      </div>

      <Section title="Name & search" description="How the site is titled in tabs and search results.">
        <Field label="Site name" value={identity.name} onChange={set("name")} placeholder={defaultName} hint="Shown in the header, footer and browser tab." />
        <Field label="Browser-tab title" value={identity.metaTitle} onChange={set("metaTitle")} placeholder={shownName} hint="The default <title>. Blank uses the site name." />
        <label className="grid gap-1.5 text-sm font-medium text-ink sm:col-span-2">
          Meta description
          <textarea value={identity.description} onChange={(e) => set("description")(e.target.value)} rows={3} maxLength={300} className={inputClass} />
          <span className="text-xs font-normal text-ink-soft">One or two sentences describing the site, shown under the title in search results.</span>
        </label>
      </Section>

      <Section title="Logo" description="Your logo in the site header and footer.">
        <ImageField
          label="Logo image"
          value={identity.logoUrl}
          onChange={set("logoUrl")}
          hint="Leave blank to show your site name as text. A PNG with a transparent background looks best."
        />
        <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3 sm:col-span-2">
          <span className="text-sm font-medium text-ink">Preview</span>
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            {identity.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary R2 URL, no fixed dimensions
              <img src={identity.logoUrl} alt={shownName} className="h-8 w-auto" />
            ) : (
              shownName
            )}
          </span>
        </div>
      </Section>

      <Section title="Favicon & sharing" description="The small browser-tab icon and the image shown when a page is shared on social media.">
        <ImageField label="Favicon" value={identity.faviconUrl} onChange={set("faviconUrl")} hint="A square icon, ideally 512x512 PNG. Blank keeps the current favicon." />
        <ImageField
          label="Social share image"
          value={identity.ogImageUrl}
          onChange={set("ogImageUrl")}
          hint="Shown when the homepage is shared. Ideally 1200x630."
        />
      </Section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save site identity"}
        </button>
        {message && <p className="text-sm text-ink-soft">{message}</p>}
      </div>
    </div>
  );
}
