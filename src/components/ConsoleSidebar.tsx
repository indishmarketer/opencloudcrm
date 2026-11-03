"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ConsoleLogoutButton from "@/components/ConsoleLogoutButton";
import ConsoleNavIcon from "@/components/ConsoleNavIcon";
import ConsoleSearch from "@/components/ConsoleSearch";
import { SITE_NAME } from "@/config/brand";

const SITE_NAME_INITIALS = SITE_NAME.split(/\s+/).map((word) => word[0]).join("").toUpperCase().slice(0, 3);

type NavGroup = { title: string; links: { href: string; label: string; badge?: number }[] };

export default function ConsoleSidebar({
  groups,
  email,
  isOwner,
}: {
  groups: NavGroup[];
  email: string;
  isOwner: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const pathname = usePathname();
  const allGroups = isOwner
    ? [...groups, { title: "Admin", links: [{ href: "/console/team", label: "Team" }] }]
    : groups;

  const displayEmail = email;

  return (
    <aside
      className={`hidden h-full min-h-0 shrink-0 flex-col border-r border-line bg-paper transition-[width] duration-200 md:flex ${
        collapsed ? "w-[4.5rem] px-2" : "w-64 px-4"
      }`}
    >
      <div className={`flex shrink-0 items-center pt-6 ${collapsed ? "flex-col gap-3" : "justify-between px-2"}`}>
        <Link href="/console" aria-label={`${SITE_NAME} console overview`} className="whitespace-nowrap font-display text-lg font-semibold tracking-tight">
          {collapsed ? SITE_NAME_INITIALS : SITE_NAME}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand console menu" : "Collapse console menu"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      <div className={`mt-5 shrink-0 ${collapsed ? "flex justify-center" : "px-2"}`}>
        <ConsoleSearch compact={collapsed} groups={allGroups} />
      </div>

      <nav
        aria-label="Console navigation"
        className={`mt-8 flex min-h-0 flex-1 flex-col overflow-y-auto pb-4 ${collapsed ? "gap-3" : "gap-6"}`}
      >
        {allGroups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="px-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">{group.title}</p>
            )}
            <div className={`flex flex-col ${collapsed ? "gap-1" : "mt-2 gap-1"}`}>
              {group.links.map((link) => {
                const active = pathname === link.href || (link.href !== "/console" && pathname.startsWith(`${link.href}/`));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    title={collapsed ? link.label : undefined}
                    aria-label={collapsed ? link.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center rounded-lg py-2 text-sm transition-colors ${
                      collapsed ? "justify-center px-2" : "gap-2.5 px-2"
                    } ${active ? "bg-paper-soft font-medium text-ink" : "text-ink-soft hover:bg-paper-soft hover:text-ink"}`}
                  >
                    <ConsoleNavIcon href={link.href} />
                    {!collapsed && <span className="truncate">{link.label}</span>}
                    {/* Red is the brand reserve colour for things that need
                        the owner, which is exactly what an unread count is.
                        Collapsed, it still shows as a dot: the number would
                        not fit, but the fact that there is something would
                        otherwise be lost entirely. */}
                    {link.badge ? (
                      collapsed ? (
                        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-600" aria-hidden />
                      ) : (
                        <span className="ml-auto shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                          {link.badge > 99 ? "99+" : link.badge}
                        </span>
                      )
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`mt-auto shrink-0 border-t border-line py-3 ${collapsed ? "flex justify-center px-1" : "px-2"}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink font-display text-xs font-bold text-paper select-none"
              title="Shubho Dey"
              aria-label="Shubho Dey"
            >
              SD
            </div>
            <ConsoleLogoutButton compact />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink font-display text-xs font-bold text-paper select-none"
                aria-hidden="true"
              >
                SD
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-semibold text-ink leading-tight">
                  Shubho Dey
                </span>
                <div className="mt-0.5 flex items-center gap-1.5 text-ink-soft">
                  <span
                    className="truncate text-[11px] leading-tight select-none font-mono tracking-wider"
                    title={showEmail ? displayEmail : "Email masked"}
                  >
                    {showEmail ? displayEmail : "••••••••••••••"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEmail((prev) => !prev)}
                    aria-label={showEmail ? "Hide email" : "Show email"}
                    title={showEmail ? "Hide email" : "Show email"}
                    className="shrink-0 text-ink-soft transition-colors hover:text-ink focus:outline-none"
                  >
                    {showEmail ? (
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <ConsoleLogoutButton compact={false} />
          </div>
        )}
      </div>
    </aside>
  );
}
