"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ConsoleCourseTabs({ courseId }: { courseId: string }) {
  const pathname = usePathname();

  const TABS = [
    { href: `/console/courses/${courseId}`, label: "Settings", exact: true },
    { href: `/console/courses/${courseId}/curriculum`, label: "Curriculum" },
    { href: `/console/courses/${courseId}/page-sections`, label: "Sales page" },
    { href: `/console/courses/${courseId}/students`, label: "Students & Progress" },
    { href: `/console/courses/${courseId}/comments`, label: "Comments" },
    { href: `/console/courses/${courseId}/preview`, label: "Preview" },
  ];

  return (
    <div className="flex flex-wrap gap-2 border-b border-line pb-4">
      <Link
        href="/console/courses"
        className="mr-4 rounded-full px-4 py-2 text-sm font-medium text-ink-soft hover:bg-paper-soft hover:text-ink transition-colors flex items-center gap-1"
      >
        ← Back
      </Link>
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
