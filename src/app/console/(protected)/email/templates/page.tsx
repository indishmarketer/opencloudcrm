import { canDeleteEmailTemplate, listEmailTemplates } from "@/lib/emailTemplates";
import ConsoleEmailTemplates from "@/components/ConsoleEmailTemplates";
import { SITE_HOSTNAME } from "@/lib/liveSiteUrl";
import { getEmailSettings, resolveEmailDomain } from "@/lib/emailSettings";

export default async function EmailTemplatesPage() {
  const templates = (await listEmailTemplates()).map((template) => ({
    ...template,
    deletable: canDeleteEmailTemplate(template),
  }));
  const [emailSettings, siteHost] = await Promise.all([
    getEmailSettings(),
    resolveEmailDomain(SITE_HOSTNAME),
  ]);
  return (
    <div>
      <p className="mb-6 max-w-2xl text-sm text-ink-soft">These are immediate, event-specific messages such as verification, password reset, payment, and course-access confirmations. They are not journeys, but their delivery and engagement can still be tracked.</p>
      <ConsoleEmailTemplates templates={templates} siteHost={siteHost} defaultDomain={SITE_HOSTNAME} sendingDomain={emailSettings.sendingDomain} />
    </div>
  );
}
