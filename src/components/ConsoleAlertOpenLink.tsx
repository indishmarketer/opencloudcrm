"use client";

import { useRouter } from "next/navigation";

/**
 * "Open" on a notification: marks it seen, then goes where it points.
 *
 * Marking happens before navigating and is awaited, because the next page
 * is a server component and a refresh racing the write would show a count
 * that had not moved yet. It is a single cheap update, and if it fails the
 * navigation still happens: ending up on the right page with a stale badge
 * is better than a dead link.
 *
 * Seen is not handled. The "Mark done" button next to this is the one that
 * clears the item; this only stops it counting as unread.
 */
export default function ConsoleAlertOpenLink({ id, href }: { id: number; href: string }) {
  const router = useRouter();

  async function open(event: React.MouseEvent<HTMLAnchorElement>) {
    // Let a middle click or a modifier click open a tab the normal way.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    await fetch(`/api/console/alerts/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "view" }),
    }).catch(() => null);
    router.push(href);
  }

  return (
    <a
      href={href}
      onClick={open}
      className="mt-2 inline-block text-sm font-medium underline underline-offset-2"
    >
      Open
    </a>
  );
}
