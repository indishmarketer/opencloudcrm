"use client";

import ConsoleBlogTabs from "@/components/ConsoleBlogTabs";
import { usePathname } from "next/navigation";

export default function ConsoleBlogLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEditor = pathname === "/console/blog/new" || pathname.startsWith("/console/blog/edit/");

  if (isEditor) return children;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Blog</h1>
      <ConsoleBlogTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
