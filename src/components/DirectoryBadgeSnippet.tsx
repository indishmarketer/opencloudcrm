"use client";

import { useState } from "react";
import { SITE_ORIGIN } from "@/lib/directoryFields";
import { SITE_NAME } from "@/config/brand";

/**
 * The snippet a free listing has to put on their own site, with a copy
 * button, shown on their listing in "My tools".
 *
 * The badge image points at our domain on purpose, and the instructions
 * say not to re-host it. That is not arbitrary: our own checker looks for
 * the **link**, not the image, so a self-hosted copy would still pass, but
 * every directory we deal with checks for the image on their domain and we
 * would rather not teach people a habit that breaks elsewhere.
 */
export default function DirectoryBadgeSnippet({
  categorySlug,
  slug,
  toolName,
}: {
  categorySlug: string;
  slug: string;
  toolName: string;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [copied, setCopied] = useState(false);

  const listingUrl = `${SITE_ORIGIN}/tools/${categorySlug}/${slug}`;
  const badgeUrl = `${SITE_ORIGIN}/badges/featured-on-indish-marketer-${theme}.svg`;
  const snippet =
    `<a href="${listingUrl}" target="_blank" rel="noopener">\n` +
    `  <img src="${badgeUrl}"\n` +
    `       alt="${toolName} is featured on ${SITE_NAME}" width="200" height="56" />\n` +
    `</a>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused outright. The snippet is on screen
      // and selectable, so there is nothing to recover from.
    }
  }

  return (
    <div className="rounded-xl border border-line bg-paper-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">Your badge</p>
        <div className="flex items-center gap-1 rounded-full border border-line bg-paper p-0.5 text-xs">
          {(["dark", "light"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTheme(option)}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                theme === option ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              {option === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs text-ink-soft">
        Paste this anywhere on your site, a footer is fine. Keep the image address as it is rather
        than saving a copy of the picture. We check for the link before your listing goes live.
      </p>

      <div className="mt-3 flex items-center justify-center rounded-lg border border-line bg-paper p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={badgeUrl} alt={`${toolName} is featured on ${SITE_NAME}`} width={200} height={56} />
      </div>

      <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-paper p-3 text-[11px] leading-5 text-ink-soft">
        {snippet}
      </pre>

      <button
        type="button"
        onClick={copy}
        className="mt-3 rounded-full bg-ink px-5 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-80"
      >
        {copied ? "Copied" : "Copy code"}
      </button>
    </div>
  );
}
