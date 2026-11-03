"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/console/blog", label: "Posts" },
  { href: "/console/blog/categories", label: "Categories" },
  { href: "/console/blog/applications", label: "Author applications" },
  { href: "/console/blog/authors", label: "Blog authors" },
];

export default function ConsoleBlogTabs() {
  const pathname = usePathname();
  return (
    <div className="mt-6 flex flex-wrap gap-1 border-b border-line text-sm" role="tablist">
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
