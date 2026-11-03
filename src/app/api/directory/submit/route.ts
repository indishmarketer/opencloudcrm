import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool, isUniqueViolation } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { slugify } from "@/lib/directory";
import { findToolLogo, uploadDirectoryAsset } from "@/lib/logoFetch";
import { escapeHtml } from "@/lib/escapeHtml";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { parseToolFields, emailSubmitter, notifyAdminOfTool, cleanToolUrl } from "@/lib/directoryReview";
import { raiseInboxAlert } from "@/lib/systemAlerts";

type OwnListing = {
  id: number;
  name: string;
  status: string;
  listing_tier: string;
  paid_at: Date | null;
};

/** The submitter's own existing listing for this name or this website, if
 * there is one. Matched on either, because somebody re-filling the form
 * after bouncing off checkout may well retype the name slightly
 * differently, and the URL is the thing that actually identifies the tool.
 * A rejected listing is deliberately excluded: if we declined it, trying
 * again with a better page is allowed. */
async function findOwnListing(userId: number, body: Record<string, unknown>): Promise<OwnListing | null> {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const slug = name ? slugify(name) : "";
  const url = cleanToolUrl(body.website_url);
  if (!slug && !url) return null;
  const result = await pool.query<OwnListing>(
    `SELECT id, name, status, listing_tier, paid_at
     FROM directory_tools
     WHERE submitted_by_user_id = $1 AND status <> 'rejected'
       AND (($2 <> '' AND slug = $2) OR ($3 <> '' AND website_url = $3))
     ORDER BY created_at DESC LIMIT 1`,
    [userId, slug, url || ""],
  );
  return result.rows[0] ?? null;
}

/** Public submission endpoint -- any logged-in user can submit their own
 * tool. Always lands 'pending' and is reviewed in /console/directory
 * before it goes live, same as API submissions. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // Their own earlier submission is checked FIRST, before the submission
  // rate limit.
  //
  // The owner hit this: he submitted a paid listing, left without paying,
  // came back, filled the form in again and was told "Too many
  // submissions" -- because each duplicate attempt burned one of five
  // hourly slots on the way to failing. The listing already existed and was
  // waiting for his money, which is not an error at all, so this returns
  // the listing and lets the form offer to pay for it.
  //
  // It gets its own, much looser limit rather than none: running ahead of
  // the submission limit means an authenticated caller could otherwise
  // repeat this query without bound. 60 an hour is far more than any real
  // retry loop and still a ceiling.
  if (!(await checkRateLimit(`directory-submit-probe:${session.userId}`, 60, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const existing = await findOwnListing(session.userId, body);
  if (existing) {
    return NextResponse.json(
      {
        error: `You already submitted ${existing.name}.`,
        existing: {
          id: existing.id,
          name: existing.name,
          status: existing.status,
          listing_tier: existing.listing_tier,
          paid: Boolean(existing.paid_at),
        },
      },
      { status: 409 },
    );
  }

  if (!(await checkRateLimit(`directory-submit:${session.userId}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  const parsed = await parseToolFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { fields } = parsed;

  const ip = req.headers.get("cf-connecting-ip") || undefined;
  const humanVerified = await verifyTurnstile(body.turnstileToken, ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human." }, { status: 400 });
  }

  const slug = slugify(fields.name);
  if (!slug) return NextResponse.json({ error: "Use letters or numbers in the tool name." }, { status: 400 });
  const taken = await pool.query("SELECT 1 FROM directory_tools WHERE slug = $1", [slug]);
  if (taken.rows.length > 0) {
    return NextResponse.json({ error: "A tool with that name is already in the directory." }, { status: 400 });
  }

  let logoUrl: string | null = null;
  try {
    const logo = await findToolLogo(fields.website_url);
    if (logo) logoUrl = await uploadDirectoryAsset(logo, "directory/logos");
  } catch {
    // no logo found, an admin can add one during review
  }

  let inserted;
  try {
    inserted = await pool.query(
      `INSERT INTO directory_tools
        (slug, name, tagline, description, category_id, pricing_type, website_url, logo_url, screenshots, status, source, submitted_by_user_id, listing_tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'user', $10, $11)
       RETURNING id, slug, status`,
      [
        slug,
        fields.name,
        fields.tagline,
        fields.description,
        fields.category_id,
        fields.pricing_type,
        fields.website_url,
        logoUrl,
        fields.screenshots,
        session.userId,
        // Anything other than an explicit paid choice is a free listing,
        // which is the tier with conditions attached. Defaulting the other
        // way would hand out paid listings to anyone who posts a stray
        // value at this endpoint.
        body.listing_tier === "paid" ? "paid" : "free",
      ]
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A tool with that name is already in the directory." }, { status: 400 });
    }
    throw err;
  }
  const tool = inserted.rows[0];

  const user = await pool.query("SELECT name FROM users WHERE id = $1", [session.userId]);
  emitWebhookEvent({
    eventType: "directory_tool.submitted",
    source: "directory_tools",
    sourceRecordId: tool.id,
    contactEmail: session.email,
    contactName: user.rows[0]?.name || null,
    userId: session.userId,
    data: { tool_id: tool.id, name: fields.name, website_url: fields.website_url, pricing_type: fields.pricing_type },
  }).catch(() => {});

  await emailSubmitter(tool.id, "tool-submission-received", { tool_name: escapeHtml(fields.name) });
  await notifyAdminOfTool(session.email, "submitted a new tool:", fields.name).catch(() => {});
  // Not awaited: a submission must not fail because the notification did.
  raiseInboxAlert({
    kind: "tool_submitted",
    dedupeKey: `tool_submitted:${tool.id}`,
    title: `${fields.name} was submitted to the directory`,
    detail: `From ${session.email}. Review it before it goes live.`,
    link: "/console/directory",
  }).catch(() => {});
  return NextResponse.json({ tool });
}
