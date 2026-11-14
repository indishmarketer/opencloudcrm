import { notFound } from "next/navigation";
import { getRawEmailTemplate } from "@/lib/emailTemplates";
import { getBusiness } from "@/lib/businessProfile";
import ConsoleFixedTemplateBuilder from "@/components/emailBuilder/ConsoleFixedTemplateBuilder";

// Same reasoning as ../[id]/page.tsx -- not nested under
// src/app/console/(protected)/email/, so the Email section's tabs can't
// bleed into this full-screen canvas.
export default async function FixedEmailBuilderPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const template = await getRawEmailTemplate(key);
  if (!template) notFound();
  const business = await getBusiness();
  return (
    <ConsoleFixedTemplateBuilder
      template={template}
      businessName={business.brand || ""}
      businessAddress={business.addressShort || ""}
    />
  );
}
