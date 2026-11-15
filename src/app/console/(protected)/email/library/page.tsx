import { listContentTemplates } from "@/lib/emailContentTemplates";
import { listEmailTemplates } from "@/lib/emailTemplates";
import ConsoleTemplates, { type ContentTemplateRow, type FixedTemplateRow } from "@/components/ConsoleTemplates";

export default async function EmailTemplatesPage() {
  const [contentTemplates, fixedTemplates] = await Promise.all([
    listContentTemplates(),
    listEmailTemplates(),
  ]);
  const content: ContentTemplateRow[] = contentTemplates.map((t) => ({
    kind: "content",
    id: t.id,
    name: t.name,
    subject: t.subject,
    body_html: t.body_html,
    category: t.category,
  }));
  const fixed: FixedTemplateRow[] = fixedTemplates.map((t) => ({
    kind: "fixed",
    key: t.key,
    label: t.label,
    description: t.description,
    subject: t.subject,
    body_html: t.body_html,
    from_email: t.from_email,
    track_opens: t.track_opens,
    allowed_vars: t.allowed_vars,
  }));
  return (
    <div>
      <p className="mb-6 max-w-2xl text-sm text-ink-soft">
        Every email this site can send -- broadcast campaigns and reusable content on one side, emails bound to a
        specific action (signup, course access, bookings, and anything you build in Automation) on the other.
        Nothing is hardcoded: every template here is fully editable and deletable, and can be written in whichever
        mode you prefer -- Visual blocks, Classic rich text, or raw HTML.
      </p>
      <ConsoleTemplates contentTemplates={content} fixedTemplates={fixed} />
    </div>
  );
}
