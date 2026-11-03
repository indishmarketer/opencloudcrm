"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import BrandDatePicker from "@/components/BrandDatePicker";

type Option = { value: string; label: string };

export default function EmailAnalyticsFilters({
  tab,
  range,
  from,
  to,
  type,
  today,
  presets,
  types,
}: {
  /** Current analytics tab ("" = overview), kept when filters change. */
  tab: string;
  range: string;
  from: string;
  to: string;
  type: string;
  today: string;
  presets: Option[];
  types: Option[];
}) {
  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(range === "custom");
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function go(next: { range?: string; from?: string; to?: string; type?: string }) {
    const params = new URLSearchParams();
    const nextRange = next.range ?? range;
    params.set("range", nextRange);
    if (nextRange === "custom") {
      params.set("from", next.from ?? from);
      params.set("to", next.to ?? to);
    }
    const nextType = next.type ?? type;
    if (nextType) params.set("type", nextType);
    if (tab) params.set("tab", tab);
    router.push(`/console/email/analytics?${params.toString()}`);
  }

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink hover:text-ink"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => {
            setCustomOpen(false);
            go({ range: p.value });
          }}
          className={pill(range === p.value && !customOpen)}
        >
          {p.label}
        </button>
      ))}
      <button type="button" onClick={() => setCustomOpen(true)} className={pill(customOpen)}>
        Custom dates
      </button>
      {customOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <BrandDatePicker value={customFrom} onChange={setCustomFrom} max={customTo || today} ariaLabel="From date" placeholder="From" />
          <span className="text-xs text-ink-soft">to</span>
          <BrandDatePicker value={customTo} onChange={setCustomTo} min={customFrom} max={today} ariaLabel="To date" placeholder="To" />
          <button
            type="button"
            disabled={!customFrom || !customTo}
            onClick={() => go({ range: "custom", from: customFrom, to: customTo })}
            className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-80 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}
      <div className="ml-auto w-44">
        <BrandSelect compact value={type} onChange={(value) => go({ type: value })} options={types} />
      </div>
    </div>
  );
}
