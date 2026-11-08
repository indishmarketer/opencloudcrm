// Superseded by src/config/brand.ts (env-var driven, part of the
// open-sourcing effort) -- re-exported here so existing imports keep working.
export { SITE_NAME, OG_LOCALE, OG_ASSET_VERSION } from "@/config/brand";
// SITE_URL specifically comes from the live (non-frozen) resolver -- every
// file importing it from here is server-only (see liveSiteUrl.ts for why).
export { SITE_URL } from "@/lib/liveSiteUrl";
