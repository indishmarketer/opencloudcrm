import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, isUniqueViolation } from "@/lib/db";
import { slugify } from "@/lib/directory";
import { TOOL_STATUSES } from "@/lib/directoryFields";
import { cleanToolUrl } from "@/lib/directoryReview";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `SELECT t.id, t.slug, t.name, t.tagline, t.description, t.category_id, c.name AS category_name,
            t.subcategory, t.pricing_type, t.website_url, t.logo_url, t.screenshots, t.screenshot_alts, t.featured,
            t.status, t.source, t.created_at, t.review_note, t.approved_email_sent_at, u.email AS submitted_by_email,
            t.listing_tier, t.paid_at, t.backlink_verified_at, t.backlink_checked_at, t.backlink_error,
            (SELECT count(*)::int FROM directory_tool_edits e WHERE e.tool_id = t.id AND e.status = 'pending') AS pending_edits
     FROM directory_tools t
     JOIN directory_categories c ON c.id = t.category_id
     LEFT JOIN users u ON u.id = t.submitted_by_user_id
     ORDER BY CASE WHEN t.status = 'pending' AND t.listing_tier = 'paid' THEN 0
                   WHEN t.status = 'pending' THEN 1 ELSE 2 END,
              CASE WHEN t.status = 'pending' THEN t.created_at END ASC,
              t.created_at DESC`
  );
  return NextResponse.json({ tools: result.rows });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, tagline, description, category_id, subcategory, pricing_type, website_url, logo_url, screenshots, featured, status } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!Number.isInteger(category_id)) {
    return NextResponse.json({ error: "A category is required." }, { status: 400 });
  }
  const cleanUrl = cleanToolUrl(website_url);
  if (!cleanUrl) {
    return NextResponse.json({ error: "Enter a valid website or GitHub link starting with https://" }, { status: 400 });
  }
  const allowedPricing = ["free", "freemium", "paid", "free_api", "paid_api"];
  if (!allowedPricing.includes(pricing_type)) {
    return NextResponse.json({ error: "Invalid pricing type." }, { status: 400 });
  }

  const slug = slugify(name);
  try {
    const result = await pool.query(
      `INSERT INTO directory_tools
        (slug, name, tagline, description, category_id, subcategory, pricing_type, website_url, logo_url, screenshots, featured, status, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual')
       RETURNING id, slug`,
      [
        slug,
        name,
        tagline || null,
        description || null,
        category_id,
        subcategory || null,
        pricing_type,
        cleanUrl,
        logo_url || null,
        Array.isArray(screenshots) ? screenshots : [],
        !!featured,
        (TOOL_STATUSES as readonly string[]).includes(status) ? status : "draft",
      ]
    );
    return NextResponse.json({ tool: result.rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A tool with that name already exists." }, { status: 400 });
    }
    throw err;
  }
}
