import { listContentTemplates } from "@/lib/emailContentTemplates";
import { canDeleteEmailTemplate, listEmailTemplates, SYSTEM_EMAIL_DEFS } from "@/lib/emailTemplates";
import ConsoleEmailLibrary from "@/components/ConsoleEmailLibrary";
import ConsoleEmailTemplates from "@/components/ConsoleEmailTemplates";
import { SITE_HOSTNAME } from "@/lib/liveSiteUrl";
import { resolveEmailDomain } from "@/lib/emailSettings";

export default async function EmailLibraryPage() {
  const [contentTemplates, fixedTemplates, siteHost] = await Promise.all([
    listContentTemplates(),
    listEmailTemplates(),
    resolveEmailDomain(SITE_HOSTNAME),
  ]);
  const fixed = fixedTemplates.map((template) => ({
    ...template,
    deletable: canDeleteEmailTemplate(template),
  }));
  return (
    <div className="space-y-10">
      <div>
        <p className="mb-6 max-w-2xl text-sm text-ink-soft">
          Reusable email content. Write one here, then pick it from a campaign, an automation step, or when emailing a
          contact directly instead of starting from a blank page. Picking one just copies its subject and content in —
          edit freely afterward, nothing stays linked back here.
        </p>
        <ConsoleEmailLibrary templates={contentTemplates} />
      </div>
      <div className="border-t border-line pt-8">
        <h2 className="font-display text-lg font-semibold">Fixed emails</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Emails that a specific action elsewhere in the app sends by key (signup, login, course access, bookings,
          and so on), as opposed to the free-standing content above. Nothing here is hardcoded or protected — every
          one can be edited or permanently deleted, and a deleted one can be recreated below.
        </p>
        <div className="mt-4">
          <ConsoleEmailTemplates templates={fixed} siteHost={siteHost} systemDefs={SYSTEM_EMAIL_DEFS as unknown as { key: string; label: string; description: string }[]} />
        </div>
      </div>
    </div>
  );
}
