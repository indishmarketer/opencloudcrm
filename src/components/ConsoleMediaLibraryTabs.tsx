"use client";

import { useState } from "react";
import ConsoleMediaLibrary from "@/components/ConsoleMediaLibrary";
import ConsoleCourseVideoLibrary from "@/components/ConsoleCourseVideoLibrary";

type Tab = "images" | "courses";

export default function ConsoleMediaLibraryTabs() {
  const [tab, setTab] = useState<Tab>("images");

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-line pb-4">
        {([["images", "Images"], ["courses", "Course videos"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === value ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "images" ? <ConsoleMediaLibrary /> : <ConsoleCourseVideoLibrary />}
      </div>
    </div>
  );
}
