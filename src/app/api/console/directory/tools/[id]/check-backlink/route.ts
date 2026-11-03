import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAdminSessionEmail } from "@/lib/auth";
import { checkBacklink, listingUrlVariants } from "@/lib/directoryBacklink";

/**
 * "Check badge" in the console: goes to the submitter's site and looks for
 * a link back to their listing. Owner-triggered, never on a schedule, in
 * line with the standing rule about not spending other people's bandwidth
 * (or ours) on background polling.
 *
 * The result is stored either way. `backlink_checked_at` without
 * `backlink_verified_at` is the "we looked and it was not there" state,
 * which is what the console shows as still waiting, and `backlink_error`
 * carries the reason so the owner can tell a missing badge apart from a
 * site that would not load at all.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const found = await pool.query<{
    slug: string;
    website_url: string;
    category_slug: string;
  }>(
    `SELECT t.slug, t.website_url, c.slug AS category_slug
     FROM directory_tools t JOIN directory_categories c ON c.id = t.category_id
     WHERE t.id = $1`,
    [id],
  );
  const tool = found.rows[0];
  if (!tool) return NextResponse.json({ error: "No such tool." }, { status: 404 });

  const result = await checkBacklink(tool.website_url, listingUrlVariants(tool.category_slug, tool.slug));

  await pool.query(
    `UPDATE directory_tools
     SET backlink_checked_at = now(),
         backlink_verified_at = CASE WHEN $2 THEN now() ELSE NULL END,
         backlink_error = $3
     WHERE id = $1`,
    [id, result.found, result.found ? null : result.reason.slice(0, 500)],
  );

  return NextResponse.json({
    ok: true,
    found: result.found,
    checkedUrl: result.checkedUrl,
    reason: result.found ? null : result.reason,
  });
}
