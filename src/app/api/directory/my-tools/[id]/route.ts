import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool, isUniqueViolation } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { deleteFromR2 } from "@/lib/r2Upload";
import { cleanToolUrl, parseToolFields, notifyAdminOfTool, type ToolFields } from "@/lib/directoryReview";

/** A submitter changing their own tool. They can't edit freely:
 * - changes requested: they update the submission and it goes back to review
 * - live: they send an edit request, which an admin approves or declines
 * Anything else (waiting for review, not accepted) can't be changed. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in to edit your tool." }, { status: 401 });

  if (!(await checkRateLimit(`directory-owner-edit:${session.userId}`, 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many edits. Try again later." }, { status: 429 });
  }

  const { id } = await params;
  const toolId = Number(id);
  if (!Number.isInteger(toolId)) return NextResponse.json({ error: "Tool not found." }, { status: 404 });

  const current = await pool.query(
    `SELECT id, name, tagline, description, category_id, pricing_type, website_url, screenshots, status
     FROM directory_tools WHERE id = $1 AND submitted_by_user_id = $2`,
    [toolId, session.userId]
  );
  const tool = current.rows[0];
  if (!tool) return NextResponse.json({ error: "Tool not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = await parseToolFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { fields } = parsed;

  if (tool.status === "changes_requested") {
    await pool.query(
      `UPDATE directory_tools SET name = $1, tagline = $2, description = $3, category_id = $4, pricing_type = $5,
         website_url = $6, screenshots = $7, status = 'pending', updated_at = now()
       WHERE id = $8`,
      [fields.name, fields.tagline, fields.description, fields.category_id, fields.pricing_type, fields.website_url, fields.screenshots, toolId]
    );
    const dropped = (tool.screenshots as string[]).filter((s) => !fields.screenshots.includes(s));
    await Promise.all(dropped.map((url) => deleteFromR2(url)));
    await notifyAdminOfTool(session.email, "sent back the changes you asked for on", fields.name).catch(() => {});
    return NextResponse.json({ ok: true, status: "pending" });
  }

  if (tool.status === "published") {
    const changes: Partial<ToolFields> = {};
    for (const key of Object.keys(fields) as (keyof ToolFields)[]) {
      const before = key === "website_url" ? cleanToolUrl(tool[key]) : tool[key];
      const after = fields[key];
      if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) {
        (changes as Record<string, unknown>)[key] = after;
      }
    }
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "Nothing has changed yet." }, { status: 400 });
    }
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) || null : null;
    try {
      await pool.query(
        "INSERT INTO directory_tool_edits (tool_id, user_id, changes, message) VALUES ($1, $2, $3, $4)",
        [toolId, session.userId, JSON.stringify(changes), message]
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json({ error: "You already have an edit request waiting for review." }, { status: 400 });
      }
      throw err;
    }
    await notifyAdminOfTool(session.email, "asked to edit their live tool", tool.name).catch(() => {});
    return NextResponse.json({ ok: true, status: "edit_requested" });
  }

  return NextResponse.json(
    { error: tool.status === "pending" ? "Your tool is waiting for review. You can edit it if we ask for changes." : "This tool can't be edited." },
    { status: 400 }
  );
}
