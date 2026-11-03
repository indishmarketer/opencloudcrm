"use client";

import { useRouter } from "next/navigation";

export default function ConsoleLogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/console/logout", { method: "POST" });
    router.push("/console/login");
    router.refresh();
  };

  if (compact) {
    return (
      <button
        onClick={handleLogout}
        aria-label="Log out"
        title="Log out"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:border-ink hover:bg-paper-soft"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={handleLogout}
      aria-label="Log out"
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-paper-soft"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
      </svg>
      <span className="whitespace-nowrap">Log out</span>
    </button>
  );
}
