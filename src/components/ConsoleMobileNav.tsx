"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ConsoleNavIcon from "@/components/ConsoleNavIcon";

export default function ConsoleMobileNav({
  groups,
  isOwner,
}: {
  groups: { title: string; links: { href: string; label: string; badge?: number }[] }[];
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Which section is open, matched on prefix as well as exact path: the
  // button used to fall back to "Menu" on every sub-page (a conversation,
  // a contact, a course), which is exactly where knowing where you are
  // matters most on a phone.
  const isActive = (href: string) =>
    pathname === href || (href !== "/console" && pathname.startsWith(`${href}/`));

  let activeLabel = "Menu";
  for (const group of groups) {
    for (const link of group.links) {
      if (isActive(link.href)) activeLabel = link.label;
    }
  }
  if (isOwner && isActive("/console/team")) {
    activeLabel = "Team";
  }

  return (
    <div className="md:hidden">
      <div className="border-b border-line px-4 py-3">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-medium shadow-sm"
        >
          <span className="truncate">{activeLabel}</span>
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {open && (
        <nav className="absolute z-50 w-full border-b border-line bg-paper px-4 pb-4 pt-2 shadow-lg">
          <div className="flex max-h-[65dvh] flex-col gap-4 overflow-y-auto overscroll-contain">
            {groups.map((group) => (
              <div key={group.title}>
                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  {group.title}
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {group.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                        isActive(link.href) ? "bg-paper-soft text-ink font-medium" : "text-ink-soft hover:bg-paper-soft hover:text-ink"
                      }`}
                    >
                      <ConsoleNavIcon href={link.href} />
                      <span className="truncate">{link.label}</span>
                      {link.badge ? (
                        <span className="ml-auto shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                          {link.badge > 99 ? "99+" : link.badge}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {isOwner && (
              <div>
                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Admin
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  <Link
                    href="/console/team"
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      isActive("/console/team") ? "bg-paper-soft text-ink font-medium" : "text-ink-soft hover:bg-paper-soft hover:text-ink"
                    }`}
                  >
                    <ConsoleNavIcon href="/console/team" />
                    <span>Team</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
