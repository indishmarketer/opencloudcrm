import { notFound } from "next/navigation";
import { getContentTemplate } from "@/lib/emailContentTemplates";
import { getBusiness } from "@/lib/businessProfile";
import ConsoleContentTemplateBuilder from "@/components/emailBuilder/ConsoleContentTemplateBuilder";

export default async function EmailLibraryTemplateBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const template = await getContentTemplate(id);
  if (!template) notFound();
  const business = await getBusiness();
  return (
    <ConsoleContentTemplateBuilder
      template={template}
      businessName={business.brand || ""}
      businessAddress={business.addressShort || ""}
    />
  );
}
