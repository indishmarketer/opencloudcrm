"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Keep public marketing chrome out of the admin workspace. */
export default function PublicSiteOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/console")) return null;
  return children;
}
