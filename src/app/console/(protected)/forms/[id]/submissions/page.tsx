import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { countFormSubmissions, getFormById, listFormSubmissions } from "@/lib/forms";
import ConsoleFormSubmissions from "@/components/ConsoleFormSubmissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Form responses | Console" };

export default async function ConsoleFormSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await getAdminSession())) redirect("/console/login");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const form = await getFormById(id);
  if (!form) notFound();

  const [submissions, totalCount] = await Promise.all([
    listFormSubmissions(id, 500),
    countFormSubmissions(id),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link href="/console/forms" className="text-sm text-ink-soft underline">
          ← All forms
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{form.name} responses</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Every answer this form has collected. Deleting a response removes it from here only — details
          already copied onto a contact stay on that contact until you remove them there.
        </p>
      </div>
      <ConsoleFormSubmissions
        formId={form.id}
        formName={form.name}
        fields={form.fields}
        totalCount={totalCount}
        submissions={submissions.map((row) => ({
          id: Number(row.id),
          field_values: row.field_values || {},
          page_url: row.page_url || "",
          created_at: new Date(row.created_at).toISOString(),
          contact_id: row.contact_id ? Number(row.contact_id) : null,
          contact_email: row.contact_email,
          contact_name: row.contact_name,
        }))}
      />
    </div>
  );
}
