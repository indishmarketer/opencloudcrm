"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PopupDialog } from "@/components/pageBlocks/PopupTrigger";
import { popupMatchesPath, type PopupSettings } from "@/lib/popupsShape";

type AutoPopup = { id: number; settings: PopupSettings; content: React.ReactNode };

const FREQUENCY_MS: Record<PopupSettings["frequency"], number> = { session: 0, day: 86_400_000, week: 7 * 86_400_000, once: Infinity };

function seenRecently(id: number, frequency: PopupSettings["frequency"]): boolean {
  try {
    if (frequency === "session") return !!sessionStorage.getItem(`popup_seen_${id}`);
    const at = Number(localStorage.getItem(`popup_seen_${id}`) || 0);
    return at > 0 && Date.now() - at < FREQUENCY_MS[frequency];
  } catch {
    return false;
  }
}

function markSeen(id: number, frequency: PopupSettings["frequency"]) {
  try {
    if (frequency === "session") sessionStorage.setItem(`popup_seen_${id}`, "1");
    else localStorage.setItem(`popup_seen_${id}`, String(Date.now()));
  } catch {
    // Storage blocked: it may show again, which is harmless.
  }
}

/** Opens popups set to "open by itself" (Console → Popups), on the pages,
 * for the audience and at the frequency each one is set to. At most one
 * opens per page view: the first that qualifies. Login state comes from
 * /api/auth/me in the browser so pages stay cacheable. */
export default function AutoPopups({ popups }: { popups: AutoPopup[] }) {
  const pathname = usePathname() || "/";
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    setOpenId(null);
    const candidates = popups.filter((popup) => popupMatchesPath(popup.settings, pathname) && !seenRecently(popup.id, popup.settings.frequency));
    if (!candidates.length) return;
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    const needsLogin = candidates.some((popup) => popup.settings.audience === "logged_out");
    const loggedIn: Promise<boolean> = needsLogin
      ? fetch("/api/auth/me").then((r) => r.json()).then((body) => !!body.user).catch(() => true)
      : Promise.resolve(false);

    void loggedIn.then((isLoggedIn) => {
      if (cancelled) return;
      const popup = candidates.find((item) => item.settings.audience === "everyone" || !isLoggedIn);
      if (!popup) return;
      let shown = false;
      const show = () => {
        if (shown || cancelled) return;
        shown = true;
        markSeen(popup.id, popup.settings.frequency);
        setOpenId(popup.id);
      };
      const timer = window.setTimeout(show, popup.settings.delaySeconds * 1000);
      cleanups.push(() => window.clearTimeout(timer));
      if (popup.settings.exitIntent) {
        const onLeave = (event: MouseEvent) => { if (event.clientY <= 0) show(); };
        document.addEventListener("mouseleave", onLeave);
        cleanups.push(() => document.removeEventListener("mouseleave", onLeave));
      }
    });
    return () => { cancelled = true; cleanups.forEach((fn) => fn()); };
  }, [pathname, popups]);

  const open = popups.find((popup) => popup.id === openId);
  if (!open) return null;
  return <PopupDialog open onClose={() => setOpenId(null)} settings={open.settings}>{open.content}</PopupDialog>;
}
