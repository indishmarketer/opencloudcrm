import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import ConsoleCampaignEditor from "@/components/ConsoleCampaignEditor";
import { CampaignAnalytics, CampaignRecipients } from "@/components/ConsoleCampaignReport";
import { countSegmentContacts } from "@/lib/contactSegments";
import { getCampaignReport } from "@/lib/campaignReport";
import { listContentTemplates } from "@/lib/emailContentTemplates";

export default async function CampaignEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, segmentResult, templates] = await Promise.all([pool.query(
    "SELECT id, subject, html, status, audience, from_email, segment_id, scheduled_at FROM newsletter_campaigns WHERE id = $1",
    [Number(id)]
  ), pool.query("SELECT id, name, rules FROM contact_segments ORDER BY is_system DESC, name"), listContentTemplates()]);
  if (result.rows.length === 0) notFound();

  const segments = await Promise.all(segmentResult.rows.map(async (segment) => ({
    id: segment.id,
    name: segment.name,
    count: await countSegmentContacts(segment.rules, true),
  })));
  const campaign = result.rows[0];
  const report = ["draft", "scheduled"].includes(campaign.status) ? null : await getCampaignReport(campaign.id);
  return (
    <ConsoleCampaignEditor
      campaign={campaign}
      segments={segments}
      templates={templates}
      report={report ? {
        analytics: <CampaignAnalytics summary={report.summary} links={report.links} />,
        recipients: <CampaignRecipients recipients={report.recipients} />,
      } : undefined}
    />
  );
}
