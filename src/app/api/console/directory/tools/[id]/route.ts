import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2Upload";
import { TOOL_STATUSES } from "@/lib/directoryFields";
import { cleanToolUrl, sendApprovedEmail } from "@/lib/directoryReview";

/** Keeps alt text only for screenshots the tool actually has. */
function cleanAlts(input: unknown, screenshots: string[]): string | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, string> = {};
  for (const [url, alt] of Object.entries(input as Record<string, unknown>)) {
    if (screenshots.includes(url) && typeof alt === "string" && alt.trim()) out[url] = alt.trim().slice(0, 200);
  }
  return JSON.stringify(out);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const toolId = Number(id);
  if (!Number.isInteger(toolId)) return NextResponse.json({ error: "Invalid tool." }, { status: 400 });

  const body = await req.json();
  const {
    name, tagline, description, category_id, subcategory, pricing_type,
    website_url, logo_url, screenshots, featured, status, screenshot_alts,
  } = body;

  if (pricing_type !== undefined) {
    const allowedPricing = ["free", "freemium", "paid", "free_api", "paid_api"];
    if (!allowedPricing.includes(pricing_type)) {
      return NextResponse.json({ error: "Invalid pricing type." }, { status: 400 });
    }
  }
  if (status !== undefined && !(TOOL_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  if (website_url !== undefined && !cleanToolUrl(website_url)) {
    return NextResponse.json({ error: "Enter a valid website or GitHub link starting with https://" }, { status: 400 });
  }

  const before = await pool.query("SELECT logo_url, screenshots, status FROM directory_tools WHERE id = $1", [toolId]);
  const previous = before.rows[0];

  await pool.query(
    `UPDATE directory_tools SET
      name = COALESCE($1, name),
      tagline = COALESCE($2, tagline),
      description = COALESCE($3, description),
      category_id = COALESCE($4, category_id),
      subcategory = COALESCE($5, subcategory),
      pricing_type = COALESCE($6, pricing_type),
      website_url = COALESCE($7, website_url),
      logo_url = COALESCE($8, logo_url),
      screenshots = COALESCE($9, screenshots),
      featured = COALESCE($10, featured),
      status = COALESCE($11, status),
      screenshot_alts = COALESCE($13, screenshot_alts),
      updated_at = now()
     WHERE id = $12`,
    [
      name ?? null,
      tagline ?? null,
      description ?? null,
      Number.isInteger(category_id) ? category_id : null,
      subcategory ?? null,
      pricing_type ?? null,
      website_url !== undefined ? cleanToolUrl(website_url) : null,
      logo_url ?? null,
      Array.isArray(screenshots) ? screenshots : null,
      typeof featured === "boolean" ? featured : null,
      status ?? null,
      toolId,
      cleanAlts(screenshot_alts, Array.isArray(screenshots) ? screenshots : previous?.screenshots || []),
    ]
  );

  // Clean up whatever R2 assets this edit just dropped -- an old logo
  // that got replaced, or screenshots removed from the array -- so
  // nothing orphans in storage once the DB no longer references it.
  if (previous) {
    const droppedAssets: string[] = [];
    if (logo_url && previous.logo_url && previous.logo_url !== logo_url) {
      droppedAssets.push(previous.logo_url);
    }
    if (Array.isArray(screenshots)) {
      for (const s of previous.screenshots || []) {
        if (!screenshots.includes(s)) droppedAssets.push(s);
      }
    }
    await Promise.all(droppedAssets.map((url) => deleteFromR2(url)));
  }

  // Publishing a user submission from the edit form tells them it's live,
  // same as the Approve button (once per tool; skipped for admins).
  let email: string | undefined;
  if (status === "published" && previous && previous.status !== "published") {
    email = await sendApprovedEmail(toolId);
  }

  return NextResponse.json({ ok: true, email });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const toolId = Number(id);
  if (!Number.isInteger(toolId)) return NextResponse.json({ error: "Invalid tool." }, { status: 400 });

  const result = await pool.query("DELETE FROM directory_tools WHERE id = $1 RETURNING logo_url, screenshots", [toolId]);
  const deleted = result.rows[0];
  if (deleted) {
    const assets = [deleted.logo_url, ...(deleted.screenshots || [])].filter(Boolean);
    await Promise.all(assets.map((url: string) => deleteFromR2(url)));
  }

  return NextResponse.json({ ok: true });
}
