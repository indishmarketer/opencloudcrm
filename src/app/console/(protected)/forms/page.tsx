import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import ConsoleForms from "@/components/ConsoleForms";
import { listForms } from "@/lib/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forms | Console" };

export default async function ConsoleFormsPage() {
  if (!(await getAdminSession())) redirect("/console/login");
  const forms = await listForms();

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl text-ink">Forms</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Create and customize forms with drag-and-drop elements, independent styling, and shareable links.
        </p>
      </div>
      <ConsoleForms forms={forms} />
    </div>
  );
}
