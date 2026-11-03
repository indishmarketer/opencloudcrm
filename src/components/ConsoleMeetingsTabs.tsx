"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/console/meetings", label: "Bookings", exact: true },
  { href: "/console/meetings/types", label: "Meeting types" },
  { href: "/console/meetings/availability", label: "Availability" },
  { href: "/console/meetings/analytics", label: "Analytics" },
];

export default function ConsoleMeetingsTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2 border-b border-line pb-4">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : (pathname === tab.href || pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              active ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
