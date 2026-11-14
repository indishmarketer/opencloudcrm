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
        The handful of emails the application itself depends on to function -- account verification, password
        reset, login links, account changes -- so they can never be deleted. Everything else (subject, body,
        branding, the &ldquo;Send from&rdquo; address) is yours to edit freely; see the Sending tab for the
        domain it uses. Every other event-specific email (payments, course access, meetings, reviews, and so
        on) now lives in Automation, where it's fully editable and deletable like anything else you build there.
      </p>
      <ConsoleEmailTemplates templates={templates} siteHost={siteHost} />
    </div>
  );
}
