/** Platforms an author link can be. The link's label is the platform name;
 * anything unrecognised gets the website globe. */
export const SOCIAL_PLATFORMS = ["Website", "YouTube", "Instagram", "X", "LinkedIn", "Facebook", "TikTok", "GitHub"] as const;

const FILLED: Record<string, string> = {
  youtube:
    "M22 12s0-3.2-.4-4.7a2.9 2.9 0 0 0-2-2.1C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.9 2.9 0 0 0-2 2C2 8.8 2 12 2 12s0 3.2.4 4.7a2.9 2.9 0 0 0 2 2.1c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.9 2.9 0 0 0 2-2 17 17 0 0 0 .4-4.8ZM10 15.3V8.7l6 3.3Z",
  x: "M4 3l7.3 9.6L4.4 21h2.1l6-6.9 4.5 6.9H21l-7.6-10L20 3h-2.1l-5.5 6.3L8.4 3H4z",
  linkedin:
    "M6.9 8.4H3.6V20h3.3zM5.3 3.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM20.4 20v-6.4c0-3.4-1.8-5-4.3-5a3.7 3.7 0 0 0-3.3 1.8V8.4H9.4c0 .9 0 9.9 0 11.6h3.4v-6.5c0-.3 0-.7.1-1 .3-.7 1-1.4 2-1.4 1.5 0 2.1 1.1 2.1 2.8V20Z",
  facebook:
    "M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.53-1.5H16.7V3.7C16.4 3.66 15.4 3.57 14.2 3.57c-2.4 0-4 1.46-4 4.15V9.9H7.5V13h2.7v8h3.3z",
  tiktok:
    "M16.6 3h-3.1v12.3a2.7 2.7 0 1 1-2.7-2.7c.3 0 .6 0 .8.1V9.5a5.9 5.9 0 1 0 5 5.8V9.1a7.6 7.6 0 0 0 4.4 1.4V7.4a4.4 4.4 0 0 1-4.4-4.4Z",
  github:
    "M12 2.3a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.7c-2.7.6-3.3-1.3-3.3-1.3-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.2-4.5-1.1-4.5-4.9 0-1.1.4-2 1-2.6-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 4.9 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.5 1 2.6 0 3.8-2.3 4.6-4.5 4.9.4.3.7.9.7 1.8v2.7c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.3Z",
};

function Icon({ label }: { label: string }) {
  const key = label.trim().toLowerCase();
  const filled = FILLED[key];
  if (filled) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d={filled} />
      </svg>
    );
  }
  if (key === "instagram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z" />
    </svg>
  );
}

/** Round icon links for an author's website and social profiles. Guest
 * authors' links are nofollow. */
export default function AuthorSocialLinks({ links, authorName, nofollow }: {
  links: { label: string; url: string }[];
  authorName: string;
  nofollow: boolean;
}) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel={nofollow ? "nofollow noopener noreferrer" : "noopener noreferrer"}
          aria-label={`${authorName} on ${link.label}`}
          title={link.label}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          <Icon label={link.label} />
        </a>
      ))}
    </div>
  );
}
