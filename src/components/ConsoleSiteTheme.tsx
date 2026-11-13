"use client";

import { useState } from "react";
import type { SiteTheme, Gradient } from "@/lib/siteThemeShape";

const HEX_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/;

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const swatch = HEX_RE.test(value) ? value : "#000000";
  return (
    <label className="grid gap-2 text-sm font-medium text-ink">
      {label}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Pick ${label}`}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-paper p-1"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm font-normal outline-none transition focus:border-ink"
        />
      </div>
    </label>
  );
}

function GradientFields({ label, value, onChange }: { label: string; value: Gradient; onChange: (g: Gradient) => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div
        className="h-16 rounded-lg"
        style={{ background: `linear-gradient(${value.angle}deg, ${value.from} 0%, ${value.via} 55%, ${value.to} 100%)` }}
      />
      <div className="grid grid-cols-3 gap-3">
        <ColorInput label="From" value={value.from} onChange={(v) => onChange({ ...value, from: v })} />
        <ColorInput label="Via" value={value.via} onChange={(v) => onChange({ ...value, via: v })} />
        <ColorInput label="To" value={value.to} onChange={(v) => onChange({ ...value, to: v })} />
      </div>
      <label className="grid gap-2 text-sm font-medium text-ink">
        Angle (degrees)
        <input
          type="number"
          min={0}
          max={360}
          value={value.angle}
          onChange={(e) => onChange({ ...value, angle: Number(e.target.value) || 0 })}
          className="w-32 rounded-xl border border-line bg-paper px-4 py-3 text-sm font-normal outline-none transition focus:border-ink"
        />
      </label>
    </div>
  );
}

export default function ConsoleSiteTheme({ initialTheme }: { initialTheme: SiteTheme }) {
  const [theme, setTheme] = useState(initialTheme);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/v1/site/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(theme),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setTheme(data.theme);
      setMessage("Saved. Live on the site immediately -- no rebuild or redeploy needed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Theme</h2>
        <p className="mt-1 text-sm text-ink-soft">
          The site&apos;s color palette and sitewide gradients. Changes apply live, with no redeploy.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-6 rounded-2xl border border-line bg-paper-soft p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorInput label="Ink (primary text / dark background)" value={theme.ink} onChange={(v) => setTheme((t) => ({ ...t, ink: v }))} />
          <ColorInput label="Paper (page background)" value={theme.paper} onChange={(v) => setTheme((t) => ({ ...t, paper: v }))} />
          <ColorInput label="Paper soft (tinted section background)" value={theme.paperSoft} onChange={(v) => setTheme((t) => ({ ...t, paperSoft: v }))} />
          <ColorInput label="Ink soft (secondary text)" value={theme.inkSoft} onChange={(v) => setTheme((t) => ({ ...t, inkSoft: v }))} />
          <ColorInput label="Line (borders, rules)" value={theme.line} onChange={(v) => setTheme((t) => ({ ...t, line: v }))} />
        </div>

        {/* The brand colour. Left equal to Ink it changes nothing, which is
            why every existing site looks the same until one is chosen. */}
        <div className="space-y-3 rounded-xl border border-line bg-paper p-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Brand colour</h3>
            <p className="mt-0.5 text-xs text-ink-soft">
              Used for primary buttons, links and focus rings. Leave it the same as Ink for a plain
              black-and-white site.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorInput label="Accent (brand)" value={theme.accent} onChange={(v) => setTheme((t) => ({ ...t, accent: v }))} />
            <ColorInput label="Accent text (on the brand colour)" value={theme.accentOn} onChange={(v) => setTheme((t) => ({ ...t, accentOn: v }))} />
            <ColorInput label="Accent soft (tinted brand surfaces)" value={theme.accentSoft} onChange={(v) => setTheme((t) => ({ ...t, accentSoft: v }))} />
          </div>
        </div>

        <GradientFields label="Dark gradient (bg-ink-gradient)" value={theme.inkGradient} onChange={(g) => setTheme((t) => ({ ...t, inkGradient: g }))} />
        <GradientFields label="Light gradient (bg-paper-gradient)" value={theme.paperGradient} onChange={(g) => setTheme((t) => ({ ...t, paperGradient: g }))} />

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {message && <p className="text-sm text-ink-soft">{message}</p>}
        </div>
      </div>
    </div>
  );
}
