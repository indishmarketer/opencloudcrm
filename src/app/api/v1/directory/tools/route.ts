import { NextRequest, NextResponse } from "next/server";
import { pool, isUniqueViolation } from "@/lib/db";
import { validateToken } from "@/lib/apiTokens";
import { slugify } from "@/lib/directory";
import { checkRateLimit } from "@/lib/rateLimit";
import { findRealLogo, uploadDirectoryAsset } from "@/lib/logoFetch";
import { deleteFromR2, rehostImageFromUrl } from "@/lib/r2Upload";
import { z } from "zod";

const SCOPE = "directory:write";
const MAX_SCREENSHOTS = 6;
const ToolSchema = z.object({
  name: z.string().trim().min(1).max(200),
  tagline: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10_000).optional(),
  category: z.string().trim().min(1).max(100),
  subcategory: z.string().trim().max(100).optional(),
  pricing_type: z.enum(["free", "freemium", "paid", "free_api", "paid_api"]),
  website_url: z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
  logo_url: z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)).optional(),
  screenshots: z.array(z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol))).max(MAX_SCREENSHOTS).optional(),
}).strict();

/** Resolves the logo for a submission without requiring the caller to
 * host a file anywhere first: an explicit logo_url gets re-hosted on our
 * own storage (same "never link a third-party domain" rule the console
 * follows), and if none was given at all, it's auto-discovered from the
 * tool's own website the same way the admin console's "Fetch logo"
 * button does. */
async function resolveLogo(logoUrl: string | undefined, websiteUrl: string): Promise<string | null> {
  if (logoUrl && typeof logoUrl === "string") {
    return rehostImageFromUrl(logoUrl, "directory/logos");
  }
  try {
    const domain = new URL(websiteUrl).hostname.replace(/^www\./, "");
    const logo = await findRealLogo(domain);
    return logo ? uploadDirectoryAsset(logo, "directory/logos") : null;
  } catch {
    return null;
  }
}

/** Lets an automation check what's already in the directory (any status)
 * before submitting, so it doesn't create duplicates of tools that are
 * already published or sitting pending review. */
export async function GET(req: NextRequest) {
  const tokenId = await validateToken(req, SCOPE);
  if (!tokenId) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });

  const result = await pool.query(
    `SELECT t.slug, t.name, t.tagline, t.description, t.website_url, t.logo_url, t.screenshots,
            t.pricing_type, t.status, t.source, c.slug AS category
     FROM directory_tools t
     JOIN directory_categories c ON c.id = t.category_id
     ORDER BY t.name ASC`
  );
  return NextResponse.json({ tools: result.rows });
}

/** External publishing endpoint -- for n8n, Claude, or any other
 * automation to submit a new directory listing with an API key issued
 * from /console/directory. Submissions always land as 'pending', never
 * straight to 'published', so a human reviews it in the console before
 * it goes live. */
export async function POST(req: NextRequest) {
  const tokenId = await validateToken(req, SCOPE);
  if (!tokenId) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });

  if (!(await checkRateLimit(`directory-api:${tokenId}`, 30, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many submissions this hour." }, { status: 429 });
  }

  const parsed = ToolSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid directory submission." }, { status: 400 });
  }
  const body = parsed.data;
  const { name, tagline, description, category, subcategory, pricing_type, website_url, logo_url, screenshots } = body;

  const categoryResult = await pool.query("SELECT id FROM directory_categories WHERE slug = $1", [category]);
  if (categoryResult.rows.length === 0) {
    return NextResponse.json({ error: `Unknown category slug '${category}'. See GET /api/directory/categories for valid slugs.` }, { status: 400 });
  }

  // Resolve the logo (auto-fetch by domain when none was given) and
  // re-host any external screenshot URLs, so a caller can submit with
  // nothing but a website_url and a few screenshot links, no separate
  // upload step required.
  const resolvedLogo = await resolveLogo(logo_url, website_url);
  const rawScreenshots = Array.isArray(screenshots) ? screenshots.slice(0, MAX_SCREENSHOTS) : [];
  const resolvedScreenshots = (
    await Promise.all(rawScreenshots.map((s: unknown) => (typeof s === "string" ? rehostImageFromUrl(s, "directory/screenshots") : null)))
  ).filter((s): s is string => !!s);

  const slug = slugify(name);
  try {
    const result = await pool.query(
      `INSERT INTO directory_tools
        (slug, name, tagline, description, category_id, subcategory, pricing_type, website_url, logo_url, screenshots, status, source, submitted_via_token_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', 'api', $11)
       RETURNING id, slug, status`,
      [
        slug,
        name,
        tagline || null,
        description || null,
        categoryResult.rows[0].id,
        subcategory || null,
        pricing_type,
        website_url,
        resolvedLogo,
        resolvedScreenshots,
        tokenId,
      ]
    );
    return NextResponse.json({ tool: result.rows[0], message: "Submitted for review. It will appear once approved in /console/directory." });
  } catch (err) {
    // The logo/screenshots above are already uploaded to R2 by this point --
    // if the row itself never gets created, nothing in the DB will ever
    // reference them, so clean them up rather than leaving orphans.
    const assets = [resolvedLogo, ...resolvedScreenshots].filter((url): url is string => Boolean(url));
    await Promise.all(assets.map((url) => deleteFromR2(url).catch(() => {})));
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A tool with that name already exists." }, { status: 400 });
    }
    throw err;
  }
}
