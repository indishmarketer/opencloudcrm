"use client";

import ConsoleEmailBuilder from "@/components/emailBuilder/ConsoleEmailBuilder";
import type { EmailTemplate } from "@/lib/emailTemplates";
import type { EmailBlock } from "@/lib/emailBlocks";

/** Thin wrapper, mirroring ConsoleContentTemplateBuilder: fetches/saves a
 * fixed email_templates row (keyed by string, not id) through the same
 * ConsoleEmailBuilder -- so a fixed-key template opens in the exact same
 * Visual/Classic/HTML composer as an ordinary one, no special treatment. */
export default function ConsoleFixedTemplateBuilder({
  template,
  businessName,
  businessAddress,
}: {
  template: EmailTemplate;
  businessName: string;
  businessAddress: string;
}) {
  return (
    <ConsoleEmailBuilder
      initialSubject={template.subject}
      initialBlocks={(template.blocks_json as EmailBlock[] | null) || []}
      initialBodyHtml={template.body_html}
      variables={template.allowed_vars.map((token) => ({ token, label: token.replace(/_/g, " ") }))}
      backHref="/console/email/library"
      backLabel="All templates"
      businessName={businessName}
      businessAddress={businessAddress}
      onSave={async ({ subject, blocks, bodyHtml }) => {
        const res = await fetch(`/api/console/email/templates/${encodeURIComponent(template.key)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, bodyHtml, blocks }),
        }).catch(() => null);
        const body = (await res?.json().catch(() => ({}))) ?? {};
        if (!res?.ok) return { ok: false, error: body.error || "Could not save this template." };
        return { ok: true };
      }}
      onSendTest={async ({ subject, bodyHtml }, testTo) => {
        const res = await fetch(`/api/console/email/templates/${encodeURIComponent(template.key)}/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, bodyHtml, fromEmail: template.from_email, testTo }),
        }).catch(() => null);
        const body = (await res?.json().catch(() => ({}))) ?? {};
        return res?.ok ? { ok: true, sentTo: body.sentTo } : { ok: false, error: body.error || "Could not send the test." };
      }}
    />
  );
}
