/** The header menu, header button, footer columns, footer tagline and
 * social links -- the parts of every page that sit outside any one page's
 * own content. Edited from /console/pages (Navigation tab), stored as one
 * JSON value in site_settings (key SITE_CHROME_KEY).
 *
 * No imports on purpose: safe for client components and plain node tests.
 * The DB read/write lives in src/lib/siteChrome.ts. */

export const SITE_CHROME_KEY = "site_chrome";

export type ChromeLink = { label: string; href: string; description: string };

/** "dropdown": a menu button opening a list of links.
 * "link": a plain top-level link.
 * "resources": the wide panel showing the latest courses, blog
 * categories, webinars and free resources (filled from the database). */
export type HeaderItem =
  | { type: "dropdown"; label: string; columns: FooterColumn[]; links?: ChromeLink[] }
  | { type: "link"; label: string; href: string }
  | { type: "resources"; label: string };

export type FooterColumn = { title: string; links: ChromeLink[] };

export type SocialPlatform = "facebook" | "x" | "youtube" | "linkedin" | "instagram" | "tiktok" | "github";
export const SOCIAL_PLATFORMS: SocialPlatform[] = ["facebook", "x", "youtube", "linkedin", "instagram", "tiktok", "github"];

export type SiteChrome = {
  header: { items: HeaderItem[]; ctaLabel: string; ctaHref: string };
  footer: { tagline: string; columns: FooterColumn[] };
  socials: Partial<Record<SocialPlatform, string>>;
};

const link = (label: string, href: string, description = ""): ChromeLink => ({ label, href, description });

/** What a fresh install starts with: every built-in section of the app,
 * with neutral wording. Rename, reorder or delete any of it in the console. */
export const DEFAULT_SITE_CHROME: SiteChrome = {
  header: {
    items: [
      {
        type: "dropdown",
        label: "Solutions",
        columns: [{ title: "", links: [link("Services", "/services", "What we do for clients"), link("Products", "/products", "Ready-to-use products and tools")] }],
      },
      { type: "resources", label: "Resources" },
      { type: "link", label: "Directory", href: "/tools" },
      {
        type: "dropdown",
        label: "Connect",
        columns: [{ title: "", links: [
          link("Newsletter", "/newsletter", "Updates in your inbox"),
          link("Book a call", "/book/discovery-call", "Find a time to talk"),
          link("Write for us", "/apply-to-write", "Apply to contribute a guest post"),
          link("Community", "/community/general", "Discuss, ask questions, connect"),
        ] }],
      },
      {
        type: "dropdown",
        label: "Company",
        columns: [{ title: "", links: [link("About", "/about", "Who we are and how we work"), link("Reviews", "/reviews", "What clients and students say")] }],
      },
    ],
    ctaLabel: "Get in touch",
    ctaHref: "/contact",
  },
  footer: {
    tagline: "",
    columns: [
      { title: "Solutions", links: [link("Services", "/services"), link("Products", "/products"), link("Tools directory", "/tools")] },
      {
        title: "Resources",
        links: [link("Courses", "/courses"), link("Blog", "/blog"), link("Webinars", "/webinars"), link("Prompt & Skill Library", "/resources/prompt-skill-library")],
      },
      {
        title: "Connect",
        links: [link("Newsletter", "/newsletter"), link("Book a call", "/book/discovery-call"), link("Write for us", "/apply-to-write"), link("Community", "/community/general")],
      },
      { title: "Company", links: [link("About Us", "/about"), link("Contact Us", "/contact"), link("Reviews", "/reviews")] },
      {
        title: "Policies",
        links: [link("Terms & Conditions", "/terms"), link("Privacy Policy", "/privacy-policy"), link("Refund Policy", "/refund-policy")],
      },
    ],
  },
  socials: {},
};

const str = (value: unknown, limit = 200) => (typeof value === "string" ? value.trim().slice(0, limit) : "");

/** Internal paths ("/about", "/#pricing") and http(s)/mailto/tel links only --
 * never javascript: or other schemes, since these render as hrefs. */
export function safeHref(value: unknown): string {
  const href = str(value, 500);
  if (!href) return "";
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith("#")) return href;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return href;
  return "";
}

function normalizeLinks(value: unknown, max = 20): ChromeLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, max)
    .map((raw) => {
      const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return { label: str(r.label, 80), href: safeHref(r.href), description: str(r.description, 160) };
    })
    .filter((l) => l.label && l.href);
}

function normalizeHeaderItem(raw: unknown): HeaderItem | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const label = str(r.label, 60);
  if (!label) return null;
  if (r.type === "resources") return {
    type: "dropdown", label,
    columns: [
      { title: "Courses", links: [link("All courses", "/courses")] },
      { title: "Blog", links: [link("All posts", "/blog")] },
      { title: "Webinars", links: [link("All webinars", "/webinars")] },
      { title: "Free resources", links: [link("All resources", "/resources")] },
    ],
  };
  if (r.type === "link") {
    const href = safeHref(r.href);
    return href ? { type: "link", label, href } : null;
  }
  if (r.type === "dropdown") {
    const columns = Array.isArray(r.columns) ? r.columns.slice(0, 5).map((col) => {
      const c = col && typeof col === "object" ? col as Record<string, unknown> : {};
      return { title: str(c.title, 60), links: normalizeLinks(c.links) };
    }).filter((column) => column.title || column.links.length) : [];
    const legacyLinks = normalizeLinks(r.links);
    return { type: "dropdown", label, columns: columns.length ? columns : [{ title: "", links: legacyLinks }], links: legacyLinks };
  }
  return null;
}

export function normalizeSiteChrome(input: unknown): SiteChrome {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const header = raw.header && typeof raw.header === "object" ? (raw.header as Record<string, unknown>) : {};
  const footer = raw.footer && typeof raw.footer === "object" ? (raw.footer as Record<string, unknown>) : {};
  const socialsRaw = raw.socials && typeof raw.socials === "object" ? (raw.socials as Record<string, unknown>) : {};

  const items = Array.isArray(header.items)
    ? header.items.slice(0, 10).map(normalizeHeaderItem).filter((i): i is HeaderItem => i !== null)
    : [];
  const columns = Array.isArray(footer.columns)
    ? footer.columns.slice(0, 8).map((col) => {
        const c = col && typeof col === "object" ? (col as Record<string, unknown>) : {};
        return { title: str(c.title, 60), links: normalizeLinks(c.links) };
      }).filter((c) => c.title)
    : [];
  const socials: SiteChrome["socials"] = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const href = safeHref(socialsRaw[platform]);
    if (href.startsWith("http")) socials[platform] = href;
  }

  return {
    header: { items, ctaLabel: str(header.ctaLabel, 40), ctaHref: safeHref(header.ctaHref) },
    footer: { tagline: str(footer.tagline, 300), columns },
    socials,
  };
}
