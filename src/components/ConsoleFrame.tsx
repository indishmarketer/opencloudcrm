"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConsoleLogoutButton from "@/components/ConsoleLogoutButton";
import ConsoleMobileNav from "@/components/ConsoleMobileNav";
import ConsoleSearch from "@/components/ConsoleSearch";
import ConsoleSidebar from "@/components/ConsoleSidebar";
import { SITE_NAME } from "@/config/brand";

type NavGroup = { title: string; links: { href: string; label: string; badge?: number }[] };

export default function ConsoleFrame({
  children,
  groups,
  email,
  isOwner,
}: {
  children: React.ReactNode;
  groups: NavGroup[];
  email: string;
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const isBlogEditor = pathname === "/console/blog/new" || pathname.startsWith("/console/blog/edit/");
  // Same full-viewport technique as the blog editor (only the mechanism is
  // shared -- the page editor builds its own chrome inside this shell, not
  // the blog editor's layout). Three routes render the same full-screen
  // ConsolePageEditor: a standalone page, a course's extra sections, and a
  // directory tool's extra sections. /console/pages itself (the list)
  // stays in the normal sidebar layout.
  const isPageEditor =
    /^\/console\/pages\/[^/]+$/.test(pathname) ||
    /^\/console\/workflows\/[^/]+$/.test(pathname) ||
    /^\/console\/courses\/[^/]+\/page-sections$/.test(pathname) ||
    /^\/console\/directory\/tools\/[^/]+\/page-sections$/.test(pathname);

  if (isBlogEditor || isPageEditor) {
    return <div className="fixed inset-0 h-[100dvh] overflow-hidden bg-white">{children}</div>;
  }

  return (
    <div className="flex min-h-[100dvh] md:fixed md:inset-0 md:min-h-0 md:overflow-hidden">
      <ConsoleSidebar groups={groups} email={email} isOwner={isOwner} />
      <div className="relative min-w-0 flex-1 max-md:overflow-x-clip md:h-full md:min-h-0 md:overflow-y-auto">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3 md:hidden">
          <Link href="/console" className="truncate font-display text-base font-semibold tracking-tight">
            {SITE_NAME}
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <ConsoleSearch compact groups={groups} />
            <ConsoleLogoutButton compact />
          </div>
        </div>
        <ConsoleMobileNav groups={groups} isOwner={isOwner} />
        <div className="mx-auto min-h-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </div>
    </div>
  );
}
