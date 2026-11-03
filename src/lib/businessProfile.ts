import { cache } from "react";
import { pool } from "@/lib/db";
import { SITE_NAME, emailAt } from "@/config/brand";
import {
  BUSINESS_PROFILE_KEY,
  EMPTY_BUSINESS_PROFILE,
  legacyBusinessProfileFromEnv,
  normalizeBusinessProfile,
  resolveBusiness,
  type BusinessProfile,
  type ResolvedBusiness,
} from "@/lib/businessProfileShape";

export type { BusinessProfile, ResolvedBusiness } from "@/lib/businessProfileShape";

export type StoredBusinessProfile = {
  profile: BusinessProfile;
  /** "database" once saved from the console; "environment" while it's still
   * coming from the old BUSINESS_* env vars; "empty" on a fresh install. */
  source: "database" | "environment" | "empty";
};

/** Server-only. Never throws: a missing table (migrations not run yet) or a
 * DB hiccup during `next build` falls back to the legacy env vars, then to
 * an empty profile, so a page render is never broken by contact details. */
export async function readStoredBusinessProfile(): Promise<StoredBusinessProfile> {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [
      BUSINESS_PROFILE_KEY,
    ]);
    if (result.rows[0]) {
      return { profile: normalizeBusinessProfile(JSON.parse(result.rows[0].value)), source: "database" };
    }
  } catch (error) {
    console.error("business profile: could not read from site_settings, using fallback.", error);
  }
  const legacy = legacyBusinessProfileFromEnv(process.env);
  if (legacy) return { profile: legacy, source: "environment" };
  return { profile: EMPTY_BUSINESS_PROFILE, source: "empty" };
}

/** Deduplicated per request, so the layout, footer and page can all ask. */
export const getBusiness = cache(async (): Promise<ResolvedBusiness> => {
  const { profile } = await readStoredBusinessProfile();
  return resolveBusiness(profile, SITE_NAME);
});

export async function saveBusinessProfile(profile: BusinessProfile): Promise<void> {
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [BUSINESS_PROFILE_KEY, JSON.stringify(profile)]
  );
}

/** The Reply-To for emails the site sends: the public contact email, else
 * the console owner, else support@ on the site's own domain. */
export async function getReplyToEmail(): Promise<string> {
  const business = await getBusiness();
  return business.email || process.env.ADMIN_EMAIL || emailAt("support");
}

/** The address shown to visitors ("email us at ..."): the business contact
 * email, else support@ on the site's own domain. Never the private
 * ADMIN_EMAIL, which is a login identity rather than a public inbox. */
export async function getPublicContactEmail(): Promise<string> {
  const business = await getBusiness();
  return business.email || emailAt("support");
}
