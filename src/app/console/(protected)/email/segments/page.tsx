import { pool } from "@/lib/db";
import { countSegmentContacts, parseSegmentRules } from "@/lib/contactSegments";
import ConsoleSegments from "@/components/ConsoleSegments";

export default async function EmailSegmentsPage() {
  const [segmentResult, courseResult, campaignResult] = await Promise.all([
    pool.query("SELECT id, name, description, rules, is_system FROM contact_segments ORDER BY is_system DESC, name"),
    pool.query("SELECT id, title FROM courses ORDER BY title"),
    pool.query("SELECT id, subject FROM newsletter_campaigns ORDER BY created_at DESC LIMIT 100"),
  ]);
  const segments = await Promise.all(segmentResult.rows.map(async (segment) => ({
    ...segment,
    rules: parseSegmentRules(segment.rules),
    contact_count: await countSegmentContacts(segment.rules, false),
    marketable_count: await countSegmentContacts(segment.rules, true),
  })));
  return <ConsoleSegments
    segments={segments}
    courses={courseResult.rows.map((course) => ({ value: String(course.id), label: course.title }))}
    campaigns={campaignResult.rows.map((campaign) => ({ value: String(campaign.id), label: `#${campaign.id} — ${campaign.subject}` }))}
  />;
}
