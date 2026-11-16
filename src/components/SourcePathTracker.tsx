"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Pages that are a step in signing up or in, not a place someone "came
 * from". */
const AUTH_STEP = /^\/(login|signup|verify|verify-email|forgot-password|reset-password|auth|account|console|unsubscribe)(\/|$)/;

/** Remembers the last ordinary page a visitor viewed (path only, 30
 * minutes), so an account created after clicking "Log in to comment" or
 * "Sign up to list your tool" also gets that page's contact source. */
export default function SourcePathTracker() {
  const pathname = usePathname() || "/";
  useEffect(() => {
    if (AUTH_STEP.test(pathname)) return;
    document.cookie = `im_src_path=${encodeURIComponent(pathname.slice(0, 300))}; path=/; max-age=1800; samesite=lax`;
  }, [pathname]);
  return null;
}
