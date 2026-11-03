"use client";

import { useState } from "react";
import ConsolePromptCategories from "@/components/ConsolePromptCategories";
import ConsolePromptItems from "@/components/ConsolePromptItems";
import ConsoleSkillItems from "@/components/ConsoleSkillItems";
import ConsoleGuideItems from "@/components/ConsoleGuideItems";

const TABS = [
  { key: "categories", label: "Categories" },
  { key: "prompts", label: "Prompts" },
  { key: "skills", label: "Skills" },
  { key: "guides", label: "Guides" },
] as const;

export default function ConsolePromptLibrary() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("categories");

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
        {tab === "categories" && <ConsolePromptCategories />}
        {tab === "prompts" && <ConsolePromptItems />}
        {tab === "skills" && <ConsoleSkillItems />}
        {tab === "guides" && <ConsoleGuideItems />}
      </div>
    </div>
  );
}
