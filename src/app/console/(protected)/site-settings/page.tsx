import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import ConsoleSiteSettings, { type SiteSettings } from "@/components/ConsoleSiteSettings";
import ConsoleBusinessProfile from "@/components/ConsoleBusinessProfile";
import ConsoleNavigationEditor from "@/components/ConsoleNavigationEditor";
import ConsoleSiteIdentity from "@/components/ConsoleSiteIdentity";
import ConsoleSiteTheme from "@/components/ConsoleSiteTheme";
import { readStoredBusinessProfile } from "@/lib/businessProfile";
import { readSiteChrome } from "@/lib/siteChrome";
import { readSiteIdentity } from "@/lib/siteIdentity";
import { getSiteTheme } from "@/lib/siteTheme";
import { getPageLinkOptions } from "@/lib/pageLinkOptions";
import { SITE_NAME } from "@/config/brand";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Site Settings | Console",
};

const DEFAULT_SETTINGS: SiteSettings = {
  promo_banner_enabled: "false",
  promo_banner_text: "",
  promo_banner_link: "/",
};

const TABS = [
  { key: "promo", href: "/console/site-settings", label: "Promo banner" },
  { key: "identity", href: "/console/site-settings?tab=identity", label: "Site identity" },
  { key: "business", href: "/console/site-settings?tab=business", label: "Business details" },
  { key: "navigation", href: "/console/site-settings?tab=navigation", label: "Menu & footer" },
  { key: "theme", href: "/console/site-settings?tab=theme", label: "Theme" },
] as const;

export default async function ConsoleSiteSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) redirect("/console/login");

  const sp = await searchParams;
  const tab =
    sp.tab === "identity" || sp.tab === "business" || sp.tab === "navigation" || sp.tab === "theme" ? sp.tab : "promo";

  const settings = { ...DEFAULT_SETTINGS };
  let initialError = "";

  try {
    const result = await pool.query("SELECT key, value FROM site_settings");
    for (const row of result.rows) {
      if (row.key in settings) settings[row.key as keyof SiteSettings] = row.value;
    }
  } catch (err: unknown) {
    console.error("[site-settings console page]", err);
    initialError = "Site settings could not be loaded. Confirm migration 036 has run, then retry.";
  }

  const [business, { chrome }, identity, linkOptions, theme] = await Promise.all([
    readStoredBusinessProfile(),
    readSiteChrome(),
    readSiteIdentity(),
    getPageLinkOptions(),
    getSiteTheme(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl text-ink">Site Settings</h1>
        <div className="mt-6 flex flex-wrap gap-1 border-b border-line text-sm" role="tablist">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Link
                key={t.key}
                href={t.href}
                role="tab"
                aria-selected={active}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 font-medium transition-colors ${
                  active ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        {tab === "identity" ? (
          <ConsoleSiteIdentity initialIdentity={identity} defaultName={SITE_NAME} />
        ) : tab === "business" ? (
          <ConsoleBusinessProfile initialProfile={business.profile} source={business.source} siteName={SITE_NAME} />
        ) : tab === "navigation" ? (
          <ConsoleNavigationEditor initial={chrome} linkOptions={linkOptions} />
        ) : tab === "theme" ? (
          <ConsoleSiteTheme initialTheme={theme} />
        ) : (
          <ConsoleSiteSettings initialSettings={settings} initialError={initialError} />
        )}
      </div>
    </div>
  );
}
