"use client";

import ConsoleEmailBuilder from "@/components/emailBuilder/ConsoleEmailBuilder";
import type { EmailContentTemplate } from "@/lib/emailContentTemplates";
import type { EmailBlock } from "@/lib/emailBlocks";

/** Thin wrapper: fetches/saves a Library template (email_content_templates)
 * through ConsoleEmailBuilder. A template with no blocks_json yet (every
 * one that exists before the builder did) starts the builder with an
 * empty canvas -- its existing hand-written body_html is left completely
 * untouched until this save actually happens; opening this page alone
 * changes nothing. */
export default function ConsoleContentTemplateBuilder({
  template,
  businessName,
  businessAddress,
  branding,
}: {
  template: EmailContentTemplate;
  businessName: string;
  businessAddress: string;
  branding: { enabled: boolean; align: "left" | "center"; accentColor: string; backgroundColor: string };
}) {
  return (
    <ConsoleEmailBuilder
      initialSubject={template.subject}
      initialBlocks={(template.blocks_json as EmailBlock[] | null) || []}
      initialBodyHtml={template.body_html}
      backHref="/console/email/library"
      backLabel="All templates"
      businessName={businessName}
      businessAddress={businessAddress}
      branding={branding}
      onSave={async ({ subject, blocks, bodyHtml }) => {
        const res = await fetch(`/api/console/email/content-templates/${template.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: template.name, subject, bodyHtml, blocks }),
        }).catch(() => null);
        const body = (await res?.json().catch(() => ({}))) ?? {};
        if (!res?.ok) return { ok: false, error: body.error || "Could not save this template." };
        return { ok: true };
      }}
    />
  );
}
