import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { listCategories } from "@/lib/directory";
import ToolOwnerForm from "@/components/ToolOwnerForm";

export const metadata = { title: "Edit your tool" };

export default async function EditMyToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?redirect=${encodeURIComponent(`/account/tools/${id}`)}`);

  const toolId = Number(id);
  if (!Number.isInteger(toolId)) notFound();
  const [result, categories] = await Promise.all([
    pool.query(
      `SELECT t.id, t.name, t.tagline, t.description, t.category_id, t.pricing_type, t.website_url, t.screenshots,
              t.status, t.review_note,
              EXISTS (SELECT 1 FROM directory_tool_edits e WHERE e.tool_id = t.id AND e.status = 'pending') AS edit_pending
       FROM directory_tools t WHERE t.id = $1 AND t.submitted_by_user_id = $2`,
      [toolId, session.userId]
    ),
    listCategories(),
  ]);
  const tool = result.rows[0];
  if (!tool) notFound();

  const canEdit = tool.status === "changes_requested" || (tool.status === "published" && !tool.edit_pending);

  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <p className="text-sm text-ink-soft">
        <Link href="/account/tools" className="hover:text-ink">My tools</Link> / {tool.name}
      </p>
      <h1 className="mt-2 font-display text-4xl font-semibold">
        {tool.status === "published" ? "Request an edit" : "Update your submission"}
      </h1>

      {tool.status === "changes_requested" && tool.review_note && (
        <div className="mt-6 rounded-xl border border-ink p-4 text-sm">
          <p className="font-medium">What we need from you</p>
          <p className="mt-1 whitespace-pre-line text-ink-soft">{tool.review_note}</p>
        </div>
      )}
      {tool.status === "published" && !tool.edit_pending && (
        <p className="mt-3 text-ink-soft">Change anything below and send it to us. Your listing stays as it is until we approve.</p>
      )}

      <div className="mt-8">
        {canEdit ? (
          <ToolOwnerForm tool={tool} categories={categories} />
        ) : (
          <div className="rounded-2xl border border-line p-8 text-center text-sm text-ink-soft">
            {tool.edit_pending
              ? "Your last edit request is still waiting for review. You can send another once we've handled it."
              : tool.status === "pending"
              ? "Your tool is waiting for review. You can edit it if we ask for changes."
              : "This tool can't be edited."}
          </div>
        )}
      </div>
    </div>
  );
}
