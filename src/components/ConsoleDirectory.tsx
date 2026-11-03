"use client";

import { useState } from "react";
import Link from "next/link";
import ConsoleDirectoryCategories from "@/components/ConsoleDirectoryCategories";
import ConsoleDirectoryTools from "@/components/ConsoleDirectoryTools";
import ConsoleDirectoryPricing from "@/components/ConsoleDirectoryPricing";

const TABS = [
  { key: "categories", label: "Categories" },
  { key: "tools", label: "Tools" },
  { key: "pricing", label: "Pricing" },
] as const;

export default function ConsoleDirectory({ initialTab = "tools" }: { initialTab?: (typeof TABS)[number]["key"] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>(initialTab);

  return (
    <div>
      <div className="flex gap-2 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "categories" && <ConsoleDirectoryCategories />}
        {tab === "tools" && <ConsoleDirectoryTools />}
        {tab === "pricing" && <ConsoleDirectoryPricing />}
      </div>

      <p className="mt-8 text-xs text-ink-soft">
        Issuing API keys for directory submissions moved to{" "}
        <Link href="/console/api-tokens" className="text-ink underline">
          API &amp; MCP access
        </Link>
        .
      </p>
    </div>
  );
}
