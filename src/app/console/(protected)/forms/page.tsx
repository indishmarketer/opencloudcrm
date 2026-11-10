import ConsoleForms from "@/components/ConsoleForms";
import { listForms } from "@/lib/forms";

export const dynamic = "force-dynamic";

export default async function ConsoleFormsPage() {
  const forms = await listForms();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Forms</h1>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Build a form with your own fields, labels and design, then place it as a page section or open it as a
        popup from any button — reusable in as many places as you want. Every form also gets a shareable link
        at /f/&lt;slug&gt;.
      </p>
      <ConsoleForms forms={forms} fixedForms={[]} />
    </div>
  );
}
