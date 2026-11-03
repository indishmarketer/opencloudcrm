"use client";

import { useState } from "react";

export type SiteSettings = {
  promo_banner_enabled: string;
  promo_banner_text: string;
  promo_banner_link: string;
};

export default function ConsoleSiteSettings({
  initialSettings,
  initialError,
}: {
  initialSettings: SiteSettings;
  initialError: string;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialError);

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/console/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setMessage("Saved. Live on the site within a few seconds (no redeploy needed).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Promo banner</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A sitewide announcement banner displayed at the top of every page.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-6 rounded-2xl border border-line bg-paper-soft p-6">
        <label className="flex items-center gap-3 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={settings.promo_banner_enabled === "true"}
            onChange={(e) =>
              setSettings((s) => ({ ...s, promo_banner_enabled: e.target.checked ? "true" : "false" }))
            }
            className="h-4 w-4"
          />
          Show the banner
        </label>

        <label className="grid gap-2 text-sm font-medium text-ink">
          Banner text
          <input
            type="text"
            maxLength={200}
            value={settings.promo_banner_text}
            onChange={(e) => setSettings((s) => ({ ...s, promo_banner_text: e.target.value }))}
            className="rounded-xl border border-line bg-paper px-4 py-3 font-normal outline-none transition focus:border-ink"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-ink">
          Link (relative path, e.g. /courses/some-course)
          <input
            type="text"
            maxLength={300}
            value={settings.promo_banner_link}
            onChange={(e) => setSettings((s) => ({ ...s, promo_banner_link: e.target.value }))}
            className="rounded-xl border border-line bg-paper px-4 py-3 font-normal outline-none transition focus:border-ink"
          />
        </label>

        <p className="text-xs text-ink-soft">
          Changing the text or link automatically re-shows the banner to visitors who already
          dismissed the old one.
        </p>

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
