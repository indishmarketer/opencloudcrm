import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { validateToken } from "@/lib/apiTokens";
import { deleteFromR2, rehostImageFromUrl } from "@/lib/r2Upload";
import { findRealLogo, uploadDirectoryAsset } from "@/lib/logoFetch";
import { z } from "zod";

const SCOPE = "directory:write";
const MAX_SCREENSHOTS = 6;
const PatchSchema = z.object({
  tagline: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10_000).optional(),
  logo_url: z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)).optional(),
  auto_logo: z.boolean().optional(),
  screenshots: z.array(z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol))).max(MAX_SCREENSHOTS).optional(),
  pricing_type: z.enum(["free", "freemium", "paid", "free_api", "paid_api"]).optional(),
  status: z.unknown().optional(),
  featured: z.unknown().optional(),
}).strict();

/** Lets an automation enrich or publish an existing listing (add a logo,
 * add screenshots, fix a description, move it live) instead of only ever
 * creating new ones. Any external image URL passed in gets re-hosted on
 * R2, same as the create endpoint. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const tokenId = await validateToken(req, SCOPE);
  if (!tokenId) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });

  const { slug } = await params;
  const existing = await pool.query(
    `SELECT id, website_url, logo_url, screenshots
     FROM directory_tools
     WHERE slug = $1 AND submitted_via_token_id = $2 AND status = 'pending'`,
    [slug, tokenId],
  );
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: `No tool with slug '${slug}'.` }, { status: 404 });
  }
  const id = existing.rows[0].id;
  const previousLogoUrl: string | null = existing.rows[0].logo_url;
  const previousScreenshots: string[] = existing.rows[0].screenshots || [];

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid listing update." }, { status: 400 });
  const body = parsed.data;
  const { tagline, description, logo_url, auto_logo, screenshots, pricing_type, status, featured } = body;

  if (status !== undefined || featured !== undefined) {
    return NextResponse.json(
      { error: "Publishing and featured status require console-admin approval." },
      { status: 403 },
    );
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  let nextLogoUrl: string | undefined;
  let nextScreenshots: string[] | undefined;

  if (typeof tagline === "string") { fields.push(`tagline = $${i++}`); values.push(tagline); }
  if (typeof description === "string") { fields.push(`description = $${i++}`); values.push(description); }
  if (typeof logo_url === "string") {
    const url = await rehostImageFromUrl(logo_url, "directory/logos");
    if (url) { nextLogoUrl = url; fields.push(`logo_url = $${i++}`); values.push(url); }
  } else if (auto_logo === true) {
    try {
      const domain = new URL(existing.rows[0].website_url).hostname.replace(/^www\./, "");
      const logo = await findRealLogo(domain);
      if (logo) {
        const url = await uploadDirectoryAsset(logo, "directory/logos");
        nextLogoUrl = url;
        fields.push(`logo_url = $${i++}`);
        values.push(url);
      }
    } catch {
      // no real logo discoverable, leave it unset rather than error
    }
  }
  if (Array.isArray(screenshots)) {
    const resolved = (
      await Promise.all(
        screenshots.slice(0, MAX_SCREENSHOTS).map((s: unknown) => (typeof s === "string" ? rehostImageFromUrl(s, "directory/screenshots") : null))
      )
    ).filter((s): s is string => !!s);
    nextScreenshots = resolved;
    fields.push(`screenshots = $${i++}`);
    values.push(resolved);
  }
  if (pricing_type !== undefined) {
    fields.push(`pricing_type = $${i++}`);
    values.push(pricing_type);
  }
  if (fields.length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  fields.push(`updated_at = now()`);
  values.push(id);
  await pool.query(`UPDATE directory_tools SET ${fields.join(", ")} WHERE id = $${i}`, values);

  // Same re-hosting pattern as the create endpoint and the console-admin
  // PATCH -- every replaced/dropped asset needs its old R2 copy cleaned up,
  // or repeated automation calls against this endpoint accumulate orphans
  // in storage indefinitely.
  const droppedAssets: string[] = [];
  if (nextLogoUrl && previousLogoUrl && previousLogoUrl !== nextLogoUrl) droppedAssets.push(previousLogoUrl);
  if (nextScreenshots) {
    for (const s of previousScreenshots) if (!nextScreenshots.includes(s)) droppedAssets.push(s);
  }
  await Promise.all(droppedAssets.map((url) => deleteFromR2(url)));

  return NextResponse.json({ ok: true });
}
