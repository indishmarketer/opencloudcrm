import { pool } from "@/lib/db";
import EarlyBirdBannerClient from "@/components/EarlyBirdBannerClient";

// Server wrapper: reads the owner-editable banner settings from the DB
// (see /console/site-settings) and renders nothing at all if it's off or
// unconfigured, so a missing migration/table never breaks the page. To
// remove the banner entirely: delete the <EarlyBirdBanner /> line in
// layout.tsx, or just turn it off from /console/site-settings.
export default async function EarlyBirdBanner() {
  let enabled = false;
  let text = "";
  let link = "/";
  let version = "1";

  try {
    const result = await pool.query(
      "SELECT key, value FROM site_settings WHERE key LIKE 'promo_banner_%'"
    );
    for (const row of result.rows) {
      if (row.key === "promo_banner_enabled") enabled = row.value === "true";
      if (row.key === "promo_banner_text") text = row.value;
      if (row.key === "promo_banner_link") link = row.value;
      if (row.key === "promo_banner_version") version = row.value;
    }
  } catch {
    return null; // table/migration not present yet -- fail silently, not a page-breaking error
  }

  if (!enabled || !text) return null;

  return <EarlyBirdBannerClient text={text} link={link} version={version} />;
}
