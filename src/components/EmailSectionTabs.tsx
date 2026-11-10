"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/console/email/campaigns", label: "Campaigns" },
  { href: "/console/email/segments", label: "Segments" },
  { href: "/console/email/library", label: "Templates" },
  { href: "/console/email/templates", label: "Transactional emails" },
  { href: "/console/email/sending", label: "Sending" },
  { href: "/console/email/analytics", label: "Analytics" },
  { href: "/console/email/cost", label: "Cost" },
];

export default function EmailSectionTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2 border-b border-line pb-4">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
