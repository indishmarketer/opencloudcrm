import { canDeleteEmailTemplate, listEmailTemplates } from "@/lib/emailTemplates";
import ConsoleEmailTemplates from "@/components/ConsoleEmailTemplates";
import { SITE_HOSTNAME } from "@/lib/liveSiteUrl";
import { resolveEmailDomain } from "@/lib/emailSettings";

export default async function EmailTemplatesPage() {
  const templates = (await listEmailTemplates()).map((template) => ({
    ...template,
    deletable: canDeleteEmailTemplate(template),
  }));
  const siteHost = await resolveEmailDomain(SITE_HOSTNAME);
  return (
    <div>
      <p className="mb-6 max-w-2xl text-sm text-ink-soft">
        These are immediate, event-specific messages such as verification, password reset, payment, and
        course-access confirmations. They are not journeys, but their delivery and engagement can still be
        tracked. The &ldquo;Send from&rdquo; address on each one is yours to set freely -- see the Sending tab
        for the domain it uses.
      </p>
      <ConsoleEmailTemplates templates={templates} siteHost={siteHost} />
    </div>
  );
}
