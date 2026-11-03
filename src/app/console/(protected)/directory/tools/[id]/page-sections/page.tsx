import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import ConsoleEntitySections from "@/components/ConsoleEntitySections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tool page sections | Console" };

/** Tools directory -> "Page sections": extra sections under a tool's page. */
export default async function ToolPageSections({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) redirect("/console/login");
  const { id } = await params;
  const result = await pool.query<{ id: number; name: string; slug: string; category: string }>(
    `SELECT t.id, t.name, t.slug, c.slug AS category
     FROM directory_tools t JOIN directory_categories c ON c.id = t.category_id WHERE t.id::text = $1`,
    [id]
  );
  const tool = result.rows[0];
  if (!tool) notFound();
  return (
    <ConsoleEntitySections
      kind="tool"
      refId={String(tool.id)}
      title={tool.name}
      backHref="/console/directory"
      backLabel="Tools directory"
      publicUrl={`/tools/${tool.category}/${tool.slug}`}
    />
  );
}
