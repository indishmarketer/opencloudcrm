"use client";

import { useState } from "react";
import Link from "next/link";

type Signup = {
  id: number;
  name: string | null;
  email: string;
  created_at: string | Date;
};

export default function ConsoleRecentSignups({ signups }: { signups: Signup[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-lg font-semibold sm:text-xl">Recent sign-ups</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {expanded
              ? "Showing latest user registrations"
              : "Hidden for privacy during video tutorials and client demos"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-paper-soft"
        >
          {expanded ? (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
              <span>Hide details (Private)</span>
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>Show sign-ups ({signups.length})</span>
            </>
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-line">
          {signups.length === 0 ? (
            <p className="p-6 text-sm text-ink-soft">No accounts yet.</p>
          ) : (
            <ul className="text-sm">
              {signups.map((u, i) => (
                <li
                  key={u.id}
                  className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6 ${
                    i === 0 ? "" : "border-t border-line"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{u.name || "Unnamed"}</span>
                    <span className="block truncate text-ink-soft">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {new Date(u.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/console/contacts"
            className="block border-t border-line px-4 py-3 text-xs font-medium text-ink-soft transition-colors hover:text-ink sm:px-6"
          >
            View all accounts in CRM →
          </Link>
        </div>
      )}
    </div>
  );
}
