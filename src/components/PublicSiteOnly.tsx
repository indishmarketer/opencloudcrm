"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Keep public marketing chrome out of the admin workspace, and off the
 * homepage when nothing's been published yet (see RootLayout -- a fresh
 * install's "not live yet" screen should have no header/footer/nav/banner
 * around it, not real-site chrome with placeholder branding). */
export default function PublicSiteOnly({
  children,
  suppressOnHome = false,
}: {
  children: ReactNode;
  suppressOnHome?: boolean;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/console")) return null;
  if (suppressOnHome && pathname === "/") return null;
  return children;
}
