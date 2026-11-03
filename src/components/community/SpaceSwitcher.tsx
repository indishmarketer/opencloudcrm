import Link from "next/link";
import type { Space } from "@/lib/community";

export default function SpaceSwitcher({ active, isModerator }: { active: Space | "leaderboard" | "messages" | "admin" | "settings"; isModerator?: boolean }) {
  const tabs: { href: string; key: string; label: string }[] = [
    { href: "/community/general", key: "general", label: "General" },
    { href: "/community/pro", key: "pro", label: "PRO" },
    { href: "/community/leaderboard", key: "leaderboard", label: "Leaderboard" },
    { href: "/community/messages", key: "messages", label: "Messages" },
  ];
  if (isModerator) {
    tabs.push({ href: "/community/admin", key: "admin", label: "Admin" });
  }

  return (
    <div className="flex gap-2 overflow-x-auto whitespace-nowrap border-b border-line [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
            active === t.key ? "border-b-2 border-ink text-ink" : "text-ink-soft hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
