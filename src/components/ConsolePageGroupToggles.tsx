"use client";

import { useState } from "react";
import type { PageGroupToggles } from "@/lib/pageGroupTogglesShape";

const GROUPS: { key: keyof PageGroupToggles; label: string; description: string }[] = [
  { key: "courses", label: "Courses", description: "The course catalogue, course landing/sales pages, and enrollment." },
  { key: "webinars", label: "Webinars", description: "The webinar library and individual webinar pages." },
  { key: "reviews", label: "Reviews", description: "The public reviews page and reviewer profile pages." },
  { key: "tools", label: "Tools directory", description: "The tools/software directory and its submission form." },
  { key: "newsletter", label: "Newsletter", description: "The newsletter signup page." },
  { key: "meetings", label: "Meetings", description: "Booking pages for meeting types, e.g. /book/discovery-call." },
  { key: "refundPolicy", label: "Refund policy", description: "The cancellation & refund policy page." },
];

export default function ConsolePageGroupToggles({ initialToggles }: { initialToggles: PageGroupToggles }) {
  const [toggles, setToggles] = useState(initialToggles);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(next: PageGroupToggles) {
    setToggles(next);
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/v1/site/page-group-toggles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setToggles(data.toggles);
      setMessage("Saved. Live on the site within a few seconds.");
    } catch (err) {
      setToggles(initialToggles);
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Page groups</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Turn whole sections of the site on or off. Off sections disappear from the menu, footer,
          sitemap, and search, and their pages stop being reachable.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="divide-y divide-line rounded-2xl border border-line bg-paper-soft">
        {GROUPS.map((g) => (
          <label key={g.key} className="flex items-start gap-3 p-5">
            <input
              type="checkbox"
              checked={toggles[g.key]}
              disabled={saving}
              onChange={(e) => save({ ...toggles, [g.key]: e.target.checked })}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-medium text-ink">{g.label}</span>
              <span className="block text-sm text-ink-soft">{g.description}</span>
            </span>
          </label>
        ))}
      </div>

      {message && <p className="text-sm text-ink-soft">{message}</p>}
    </div>
  );
}
