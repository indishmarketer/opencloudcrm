import { listContentTemplates } from "@/lib/emailContentTemplates";
import ConsoleEmailLibrary from "@/components/ConsoleEmailLibrary";

export default async function EmailLibraryPage() {
  const templates = await listContentTemplates();
  return (
    <div>
      <p className="mb-6 max-w-2xl text-sm text-ink-soft">
        Reusable email content. Write one here, then pick it from a campaign, an automation step, or when emailing a
        contact directly instead of starting from a blank page. Picking one just copies its subject and content in —
        edit freely afterward, nothing stays linked back here.
      </p>
      <ConsoleEmailLibrary templates={templates} />
    </div>
  );
}
