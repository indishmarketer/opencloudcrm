"use client";

export default function LogoutButton() {
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        // A full page load, not router.push -- client components like the
        // nav bar fetch their logged-in state once on mount and don't
        // re-run that on a soft navigation/refresh, so the header kept
        // showing "Account" until a manual reload.
        window.location.href = "/";
      }}
      className="shrink-0 whitespace-nowrap rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink hover:bg-paper"
    >
      Log out
    </button>
  );
}
