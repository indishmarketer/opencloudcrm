import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  DEFAULT_LISTING_PRICE_USD,
  LISTING_PRICE_KEY,
  MAX_LISTING_PRICE_USD,
  MIN_LISTING_PRICE_USD,
  getDirectoryListingPrice,
} from "@/lib/directoryListingPrice";

const ALLOWED_KEYS = new Set([
  "promo_banner_enabled",
  "promo_banner_text",
  "promo_banner_link",
  LISTING_PRICE_KEY,
]);

const DEFAULTS: Record<string, string> = {
  promo_banner_enabled: "false",
  promo_banner_text: "",
  promo_banner_link: "/",
  promo_banner_version: "1",
  [LISTING_PRICE_KEY]: String(DEFAULT_LISTING_PRICE_USD),
};

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await pool.query("SELECT key, value FROM site_settings");
    const settings: Record<string, string> = { ...DEFAULTS };
    for (const row of result.rows) settings[row.key] = row.value;
    // The rupee figure is derived, never stored, so it cannot be a setting.
    // It rides along here so a client-rendered price editor can show what
    // an Indian buyer is actually charged without a second endpoint.
    const { prices } = await getDirectoryListingPrice();
    return NextResponse.json({ settings, meta: { listing_price_inr: prices.inr } });
  } catch (err: unknown) {
    console.error("[site-settings GET]", err);
    return NextResponse.json({ error: "Failed to load site settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const updates: { key: string; value: string }[] = [];
    let contentChanged = false;

    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_KEYS.has(k)) continue;
      if (typeof v !== "string") continue;
      const strVal = v.trim();

      if (k === "promo_banner_enabled" && strVal !== "true" && strVal !== "false") {
        return NextResponse.json({ error: "promo_banner_enabled must be 'true' or 'false'" }, { status: 400 });
      }
      if (k === "promo_banner_text" && strVal.length > 200) {
        return NextResponse.json({ error: "Banner text is too long (max 200 chars)" }, { status: 400 });
      }
      if (k === "promo_banner_link" && (strVal.length > 300 || !strVal.startsWith("/"))) {
        return NextResponse.json({ error: "Banner link must be a relative path starting with /" }, { status: 400 });
      }
      // Whole dollars only, inside the guard rails. A 0 here would hand out
      // free paid listings and a 5000 would look like fraud at checkout, so
      // both are refused rather than clamped: silently charging something
      // other than the number he typed is worse than an error message.
      if (k === LISTING_PRICE_KEY) {
        const amount = Number(strVal);
        if (
          !Number.isInteger(amount) ||
          amount < MIN_LISTING_PRICE_USD ||
          amount > MAX_LISTING_PRICE_USD
        ) {
          return NextResponse.json(
            {
              error: `The listing price must be a whole number of dollars between ${MIN_LISTING_PRICE_USD} and ${MAX_LISTING_PRICE_USD}.`,
            },
            { status: 400 },
          );
        }
      }

      if (k === "promo_banner_text" || k === "promo_banner_link") contentChanged = true;
      updates.push({ key: k, value: strVal });
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });
    }

    for (const update of updates) {
      await pool.query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
        [update.key, update.value]
      );
    }

    // Bump the version whenever the visible text/link changes, so visitors
    // who already dismissed the OLD banner see the new one instead of it
    // staying hidden forever from their earlier dismissal.
    if (contentChanged) {
      await pool.query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ('promo_banner_version', '1', now())
         ON CONFLICT (key) DO UPDATE SET value = (COALESCE(site_settings.value, '0')::int + 1)::text, updated_at = now()`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[site-settings PATCH]", err);
    return NextResponse.json({ error: "Failed to update site settings" }, { status: 500 });
  }
}
