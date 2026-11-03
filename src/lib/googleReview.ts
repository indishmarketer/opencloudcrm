import { pool } from "@/lib/db";

export async function getGoogleReviewUrl(): Promise<string | null> {
  const result = await pool.query("SELECT value FROM site_settings WHERE key = 'google_review_url'");
  const value = result.rows[0]?.value?.trim();
  return value || null;
}

export function isValidGoogleReviewUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const googleHost = /(^|\.)google\.(com|co\.[a-z]{2}|[a-z]{2})$/i.test(parsed.hostname) || parsed.hostname === "g.page";
    return parsed.protocol === "https:" && googleHost;
  } catch {
    return false;
  }
}

export async function setGoogleReviewUrl(value: string): Promise<void> {
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('google_review_url', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
    [value],
  );
}
