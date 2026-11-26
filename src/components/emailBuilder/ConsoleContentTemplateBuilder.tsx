"use client";

import ConsoleEmailBuilder from "@/components/emailBuilder/ConsoleEmailBuilder";
import type { EmailContentTemplate } from "@/lib/emailContentTemplates";
import type { EmailBlock } from "@/lib/emailBlocks";
import { TEMPLATE_VARIABLES } from "@/lib/messageVariables";

/** Fetches/saves a Library template through the shared composer. HTML-only
 * templates retain their source until the owner explicitly converts them. */
export default function ConsoleContentTemplateBuilder({
  template,
  businessName,
  businessAddress,
}: {
  template: EmailContentTemplate;
  businessName: string;
  businessAddress: string;
}) {
  return (
    <ConsoleEmailBuilder
      initialSubject={template.subject}
      initialBlocks={(template.blocks_json as EmailBlock[] | null) || []}
      initialBodyHtml={template.body_html}
      variables={TEMPLATE_VARIABLES}
      backHref="/console/email/library"
      backLabel="All templates"
      businessName={businessName}
      businessAddress={businessAddress}
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
      onSendTest={async ({ subject, bodyHtml }, testTo) => {
        const res = await fetch(`/api/console/email/content-templates/${template.id}/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, bodyHtml, testTo }),
        }).catch(() => null);
        const body = (await res?.json().catch(() => ({}))) ?? {};
        return res?.ok ? { ok: true, sentTo: body.sentTo } : { ok: false, error: body.error || "Could not send the test." };
      }}
    />
  );
}
