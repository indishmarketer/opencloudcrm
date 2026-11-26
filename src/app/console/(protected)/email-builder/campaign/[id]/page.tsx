import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { getBusiness } from "@/lib/businessProfile";
import ConsoleCampaignBuilder from "@/components/emailBuilder/ConsoleCampaignBuilder";

export default async function CampaignBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [result, business] = await Promise.all([
    pool.query("SELECT id, name, subject, html, blocks_json, from_email FROM newsletter_campaigns WHERE id = $1 AND status = 'draft'", [id]),
    getBusiness(),
  ]);
  if (!result.rows[0]) notFound();
  return <ConsoleCampaignBuilder campaign={result.rows[0]} businessName={business.brand || ""} businessAddress={business.addressShort || ""} />;
}
