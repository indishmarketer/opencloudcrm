"use client";

import { useState } from "react";

/**
 * The one editable thing on the Payments page: what a paid directory
 * listing costs.
 *
 * It saves through the existing `/api/console/site-settings` endpoint
 * rather than a new route, because that endpoint already does admin auth
 * and the key/value upsert, and the value lives in the same
 * `site_settings` table as the promo banner. The validation that matters
 * (whole dollars, inside the guard rails) is enforced there, server side;
 * the `min`/`max` on this input only saves a round trip.
 */
export default function ConsolePaymentsSettings({
  initialPriceUsd,
  inrPreview,
  min,
  max,
}: {
  initialPriceUsd: number;
  /** What this many dollars converts to today, so he can see the figure an
   * Indian buyer will actually be charged by Razorpay. */
  inrPreview: number | null;
  min: number;
  max: number;
}) {
  const [price, setPrice] = useState(String(initialPriceUsd));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/console/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory_listing_price_usd: price.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setMessage("Saved. New checkouts use this price within a few minutes, no redeploy needed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const changed = price.trim() !== String(initialPriceUsd);

  return (
    <div className="rounded-2xl border border-line bg-paper-soft p-6">
      <h2 className="font-display text-lg font-semibold">Paid directory listing</h2>
      <p className="mt-1 text-sm text-ink-soft">
        The one-time fee for a paid listing in the tools directory. Set it in dollars; the rupee
        amount is converted at the live rate at checkout, exactly like a course.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="grid gap-2 text-sm font-medium">
          Price (USD)
          <div className="flex items-center gap-2">
            <span className="text-ink-soft">$</span>
            <input
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={1}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="w-28 rounded-xl border border-line bg-paper px-4 py-3 font-normal outline-none transition focus:border-ink"
            />
          </div>
        </label>
        {inrPreview != null && !changed && (
          <p className="pb-3 text-sm text-ink-soft">
            Charged today as ₹{inrPreview.toLocaleString("en-IN")} on Razorpay.
          </p>
        )}
        {changed && <p className="pb-3 text-sm text-ink-soft">Unsaved.</p>}
      </div>

      <p className="mt-2 text-xs text-ink-soft">
        Whole dollars, between ${min} and ${max}. Changing it does not alter anything already paid
        for, and a checkout someone has open is re-priced when they start it again.
      </p>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || !changed}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save price"}
        </button>
        {message && <p className="text-sm text-ink-soft">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
