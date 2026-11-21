import { listContentTemplates } from "@/lib/emailContentTemplates";
import { listEmailTemplates } from "@/lib/emailTemplates";
import ConsoleTemplates, { type ContentTemplateRow, type FixedTemplateRow } from "@/components/ConsoleTemplates";

/** 'courses' -> 'Courses'. The categories are lower-case slugs chosen
 * when each template was seeded; this is only how they read on screen. */
function folderLabel(category: string): string {
  const trimmed = (category || "").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

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
    folder: t.folder,
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
    // The fixed templates ship already grouped, so their stored
    // category is the folder the page shows them under.
    folder: folderLabel(t.category),
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
