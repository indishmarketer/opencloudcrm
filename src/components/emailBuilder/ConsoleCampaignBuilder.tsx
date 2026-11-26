"use client";

import ConsoleEmailBuilder from "@/components/emailBuilder/ConsoleEmailBuilder";
import type { EmailBlock } from "@/lib/emailBlocks";
import { CONTACT_MESSAGE_VARIABLES } from "@/lib/messageVariables";

export default function ConsoleCampaignBuilder({ campaign, businessName, businessAddress }: {
  campaign: { id: number; name: string; subject: string; html: string; blocks_json: EmailBlock[] | null; from_email: string };
  businessName: string;
  businessAddress: string;
}) {
  return <ConsoleEmailBuilder
    initialSubject={campaign.subject}
    documentName={campaign.name}
    variables={CONTACT_MESSAGE_VARIABLES}
    initialBodyHtml={campaign.html}
    initialBlocks={campaign.blocks_json || []}
    backHref={`/console/email/campaigns/${campaign.id}`}
    backLabel="Prepare campaign"
    returnAfterSave
    businessName={businessName}
    businessAddress={businessAddress}
    onSave={async ({ subject, blocks, bodyHtml }) => {
      if (!subject.trim()) return { ok: false, error: "Add a subject before saving this campaign." };
      const res = await fetch(`/api/console/email/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html: bodyHtml, blocks }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => ({}))) ?? {};
      return res?.ok ? { ok: true } : { ok: false, error: body.error || "Could not save this campaign." };
    }}
    onSendTest={async ({ subject, bodyHtml }, testTo) => {
      const res = await fetch(`/api/console/email/campaigns/${campaign.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html: bodyHtml, fromEmail: campaign.from_email, testTo }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => ({}))) ?? {};
      return res?.ok ? { ok: true, sentTo: body.sentTo } : { ok: false, error: body.error || "Could not send the test." };
    }}
  />;
}
