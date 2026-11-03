import { canDeleteEmailTemplate, listEmailTemplates } from "@/lib/emailTemplates";
import ConsoleEmailTemplates from "@/components/ConsoleEmailTemplates";

export default async function EmailTemplatesPage() {
  const templates = (await listEmailTemplates()).map((template) => ({
    ...template,
    deletable: canDeleteEmailTemplate(template),
  }));
  return <div><p className="mb-6 max-w-2xl text-sm text-ink-soft">These are immediate, event-specific messages such as verification, password reset, payment, and course-access confirmations. They are not journeys, but their delivery and engagement can still be tracked.</p><ConsoleEmailTemplates templates={templates} /></div>;
}
