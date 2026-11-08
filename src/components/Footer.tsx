import Link from "next/link";
import { getBusiness } from "@/lib/businessProfile";
import { getPublicSiteChrome } from "@/lib/siteChrome";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import type { SocialPlatform } from "@/lib/siteChromeShape";

const SOCIAL_ICONS: Record<SocialPlatform, { label: string; path: string }> = {
  facebook: { label: "Facebook", path: "M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.53-1.5H16.7V3.7C16.4 3.66 15.4 3.57 14.2 3.57c-2.4 0-4 1.46-4 4.15V9.9H7.5V13h2.7v8h3.3z" },
  x: { label: "X", path: "M4 3l7.3 9.6L4.4 21h2.1l6-6.9 4.5 6.9H21l-7.6-10L20 3h-2.1l-5.5 6.3L8.4 3H4z" },
  youtube: { label: "YouTube", path: "M22 12s0-3.2-.4-4.7a2.9 2.9 0 0 0-2-2.1C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.9 2.9 0 0 0-2 2C2 8.8 2 12 2 12s0 3.2.4 4.7a2.9 2.9 0 0 0 2 2.1c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.9 2.9 0 0 0 2-2 17 17 0 0 0 .4-4.8ZM10 15.3V8.7l6 3.3Z" },
  linkedin: { label: "LinkedIn", path: "M6.9 8.4H3.6V20h3.3zM5.3 3.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM20.4 20v-6.4c0-3.4-1.8-5-4.3-5a3.7 3.7 0 0 0-3.3 1.8V8.4H9.4c0 .9 0 9.9 0 11.6h3.4v-6.5c0-.3 0-.7.1-1 .3-.7 1-1.4 2-1.4 1.5 0 2.1 1.1 2.1 2.8V20Z" },
  instagram: { label: "Instagram", path: "M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm0 2A3.8 3.8 0 0 0 4 7.8v8.4A3.8 3.8 0 0 0 7.8 20h8.4a3.8 3.8 0 0 0 3.8-3.8V7.8A3.8 3.8 0 0 0 16.2 4H7.8ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.3-3.3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z" },
  tiktok: { label: "TikTok", path: "M16.6 3a4.7 4.7 0 0 0 3.9 4.3v3.1a7.8 7.8 0 0 1-3.9-1.2v6.3A5.6 5.6 0 1 1 11 9.9v3.2a2.5 2.5 0 1 0 2.5 2.5V3h3.1Z" },
  github: { label: "GitHub", path: "M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" },
};

const linkClass = "text-sm text-white/60 transition-colors hover:text-white";

function ContactIcon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-white/50" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default async function Footer() {
  const [business, chrome, identity] = await Promise.all([getBusiness(), getPublicSiteChrome(), getSiteIdentity()]);
  const siteName = resolveSiteName(identity);
  const columns = chrome.footer.columns;
  const socials = (Object.entries(chrome.socials) as [SocialPlatform, string][])
    .filter(([, href]) => href)
    .map(([platform, href]) => ({ href, ...SOCIAL_ICONS[platform] }));
  const contactItems = [
    business.addressShortLine && "address",
    business.email && "email",
    business.phone && "phone",
  ].filter(Boolean);

  return (
    <footer className="bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-6xl px-6 pb-7 pt-12">
        <div
          className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(var(--footer-columns),minmax(0,1fr))]"
          style={{ "--footer-columns": Math.max(columns.length, 1) } as React.CSSProperties}
        >
          <div>
            {identity.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo is an arbitrary uploaded URL, no fixed dimensions
              <img src={identity.logoUrl} alt={siteName} className="h-8 w-auto" />
            ) : (
              <span className="font-display text-lg font-semibold tracking-tight">{siteName}</span>
            )}
            {chrome.footer.tagline && (
              <p className="mt-3 max-w-xs text-sm leading-6 text-white/60">{chrome.footer.tagline}</p>
            )}
            <div className="mt-6 flex items-center gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-white hover:text-white"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    <path d={s.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-white">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={`${l.href}-${l.label}`}>
                    <Link href={l.href} className={linkClass}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {contactItems.length > 0 && (
          <ul className="mt-8 flex flex-col items-start gap-2 text-sm text-white/60 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-8">
            {business.addressShortLine && (
              <li className="flex items-center gap-2.5">
                <ContactIcon d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
                <address className="not-italic">{business.addressShortLine}</address>
              </li>
            )}
            {business.email && (
              <li className="flex items-center gap-2.5">
                <ContactIcon d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l9 6 9-6" />
                <a href={`mailto:${business.email}`} className="transition-colors hover:text-white">
                  {business.email}
                </a>
              </li>
            )}
            {business.phone && (
              <li className="flex items-center gap-2.5">
                <ContactIcon d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
                <a href={business.phoneHref} className="transition-colors hover:text-white">
                  {business.phone}
                </a>
              </li>
            )}
          </ul>
        )}

        <div className="mt-5 text-left text-xs leading-5 text-white/45 sm:text-center">
          <p>© {new Date().getFullYear()} {business.brand || siteName}. All rights reserved.</p>
          {business.legalLine && <p>{business.legalLine}</p>}
        </div>
      </div>
    </footer>
  );
}
