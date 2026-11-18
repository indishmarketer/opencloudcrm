"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Forms are managed from code/MCP in the private deployment, so the console
// only links to the remaining visual page surfaces.
const TABS = [
  { href: "/console/pages", label: "Pages" },
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
