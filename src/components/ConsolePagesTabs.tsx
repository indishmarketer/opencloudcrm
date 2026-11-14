"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pages, Forms and Popups are one section in the console menu, split into
// tabs here instead of three separate sidebar entries -- same convention as
// ConsoleBlogTabs. Each tab is still its own route (and its own fullscreen
// editor for an individual page/form/popup); this only governs the three
// list screens.
const TABS = [
  { href: "/console/pages", label: "Pages" },
  { href: "/console/forms", label: "Forms" },
  { href: "/console/popups", label: "Popups" },
];

export default function ConsolePagesTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1 border-b border-line text-sm" role="tablist">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 font-medium transition-colors ${
              active ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
