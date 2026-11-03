"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/console/whatsapp", label: "Templates" },
  { href: "/console/whatsapp/messages", label: "Messages" },
  { href: "/console/whatsapp/campaigns", label: "Campaigns" },
  { href: "/console/whatsapp/analytics", label: "Reports" },
  { href: "/console/whatsapp/numbers", label: "Numbers" },
  { href: "/console/whatsapp/cost", label: "Cost" },
];

export default function WhatsAppSectionTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2 border-b border-line pb-4">
      {TABS.map((tab) => {
        const active = tab.href === "/console/whatsapp" ? pathname === tab.href : pathname.startsWith(tab.href);
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
