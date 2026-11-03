"use client";

import { useState, type ReactNode } from "react";

export default function ProfileTabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key);

  return (
    <div className="mt-8">
      <div className="flex gap-2 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              active === t.key ? "border-b-2 border-ink text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-5">{tabs.find((t) => t.key === active)?.content}</div>
    </div>
  );
}
