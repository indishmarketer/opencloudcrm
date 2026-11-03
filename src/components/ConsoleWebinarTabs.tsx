import Link from "next/link";

type Tab = "registrations" | "automation" | "engagement" | "responses" | "analytics";

export default function ConsoleWebinarTabs({ webinarId, active }: { webinarId: number; active: Tab }) {
  const tabs: Array<{ key: Tab; label: string; href: string }> = [
    { key: "registrations", label: "Registrations", href: `/console/webinars/${webinarId}/registrations` },
    { key: "automation", label: "Schedule and interactions", href: `/console/webinars/${webinarId}/automation` },
    { key: "engagement", label: "Questions by broadcast", href: `/console/webinars/${webinarId}/engagement` },
    { key: "responses", label: "Quiz & question responses", href: `/console/webinars/${webinarId}/responses` },
    { key: "analytics", label: "Analytics", href: `/console/webinars/${webinarId}/analytics` },
  ];
  return <nav className="mt-7 flex gap-1 overflow-x-auto border-b border-line" aria-label="Webinar management">
    {tabs.map((tab) => <Link key={tab.key} href={tab.href} aria-current={active === tab.key ? "page" : undefined} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium ${active === tab.key ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>{tab.label}</Link>)}
  </nav>;
}
