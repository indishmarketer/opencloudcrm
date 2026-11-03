"use client";

import { useRouter } from "next/navigation";

/** sessionStorage key the browse page writes its current URL (with
 * tab/category/search) to, every time that state changes. Shared with
 * PromptLibraryBrowser.tsx -- keep the two in sync if this changes. */
export const LIBRARY_LAST_BROWSE_URL_KEY = "psl-last-browse-url";

/** Goes back to whichever tab/category/search state of the browse page the
 * visitor last had open this session, instead of always jumping to one
 * fixed destination and losing their place.
 *
 * Deliberately does NOT use document.referrer or router.back(): Next.js
 * client-side transitions (clicking a <Link>) never update
 * document.referrer, it only reflects the very first full page load in the
 * tab, so a referrer-based "did they come from this site" check silently
 * fails for the normal in-app navigation case, not just the "opened a
 * shared link directly" case it was meant for. Reading back the exact
 * browse URL from sessionStorage works regardless of how this page was
 * reached, and falls back to a plain library link when nothing was
 * recorded (a shared link opened with no prior visit this session). */
export default function LibraryBackLink({ fallbackHref, label }: { fallbackHref: string; label: string }) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    const lastBrowseUrl = typeof window !== "undefined" ? sessionStorage.getItem(LIBRARY_LAST_BROWSE_URL_KEY) : null;
    router.push(lastBrowseUrl || fallbackHref);
  }

  return (
    <a href={fallbackHref} onClick={handleClick} className="text-sm text-ink-soft hover:text-ink">
      {label}
    </a>
  );
}
