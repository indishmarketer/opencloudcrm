import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2Upload";
import { escapeHtml } from "@/lib/escapeHtml";
import { emailSubmitter, noteHtml, toolUrls } from "@/lib/directoryReview";

const FIELDS = ["name", "tagline", "description", "category_id", "pricing_type", "website_url", "screenshots"] as const;

/** Approve (apply the changes to the live tool) or decline an edit request,
 * then email the submitter. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const editId = Number(id);
  if (!Number.isInteger(editId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (action !== "approve" && action !== "reject") return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 3000) || null : null;

  const outcome = await withTransaction(async (client) => {
    const found = await client.query(
      `SELECT e.id, e.tool_id, e.changes, t.screenshots AS old_screenshots
       FROM directory_tool_edits e JOIN directory_tools t ON t.id = e.tool_id
       WHERE e.id = $1 AND e.status = 'pending' FOR UPDATE OF e`,
      [editId]
    );
    const edit = found.rows[0];
    if (!edit) return null;
    const changes = edit.changes as Record<string, unknown>;
    const oldShots = (edit.old_screenshots || []) as string[];
    const newShots = Array.isArray(changes.screenshots) ? (changes.screenshots as string[]) : null;
    let dropped: string[] = [];

    if (action === "approve") {
      if (changes.category_id !== undefined) {
        const category = await client.query("SELECT 1 FROM directory_categories WHERE id = $1", [changes.category_id]);
        if (category.rows.length === 0) delete changes.category_id;
      }
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const field of FIELDS) {
        if (changes[field] === undefined) continue;
        values.push(changes[field]);
        sets.push(`${field} = $${values.length}`);
      }
      if (sets.length > 0) {
        values.push(edit.tool_id);
        await client.query(`UPDATE directory_tools SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values);
      }
      if (newShots) dropped = oldShots.filter((s) => !newShots.includes(s));
    } else if (newShots) {
      // Uploads that never went live.
      dropped = newShots.filter((s) => !oldShots.includes(s));
    }

    await client.query(
      "UPDATE directory_tool_edits SET status = $1, admin_note = $2, reviewed_at = now() WHERE id = $3",
      [action === "approve" ? "approved" : "rejected", note, editId]
    );
    return { toolId: edit.tool_id as number, dropped };
  });

  if (!outcome) return NextResponse.json({ error: "This request was already handled." }, { status: 404 });
  await Promise.all(outcome.dropped.map((url) => deleteFromR2(url)));

  const tool = (
    await pool.query(
      `SELECT t.id, t.slug, t.name, c.slug AS category_slug FROM directory_tools t
       JOIN directory_categories c ON c.id = t.category_id WHERE t.id = $1`,
      [outcome.toolId]
    )
  ).rows[0];
  const urls = toolUrls(tool);
  const sent =
    action === "approve"
      ? await emailSubmitter(tool.id, "tool-edit-approved", { tool_name: escapeHtml(tool.name), tool_url: urls.tool_url })
      : await emailSubmitter(tool.id, "tool-edit-rejected", {
          tool_name: escapeHtml(tool.name),
          note: noteHtml(note),
          manage_url: urls.manage_url,
        });
  return NextResponse.json({ ok: true, email: sent ? "sent" : "skipped" });
}
