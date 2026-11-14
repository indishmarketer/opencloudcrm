import { notFound } from "next/navigation";
import { getContentTemplate } from "@/lib/emailContentTemplates";
import { getBusiness } from "@/lib/businessProfile";
import { getEmailSettings } from "@/lib/emailSettings";
import ConsoleContentTemplateBuilder from "@/components/emailBuilder/ConsoleContentTemplateBuilder";

// Deliberately NOT nested under src/app/console/(protected)/email/ -- that
// layout always renders the Email heading + EmailSectionTabs, which would
// bleed into this full-screen canvas (ConsoleFrame already promotes this
// route to a bare fixed-viewport box; a parent section layout above it
// would still push the canvas down and clip it). Same reasoning as why
// /console/pages/[id] and /console/forms/[id] have no parent section
// layout either.
export default async function EmailBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const template = await getContentTemplate(id);
  if (!template) notFound();
  const [business, emailSettings] = await Promise.all([getBusiness(), getEmailSettings()]);
  return (
    <ConsoleContentTemplateBuilder
      template={template}
      businessName={business.brand || ""}
      businessAddress={business.addressShort || ""}
      branding={{
        enabled: emailSettings.brandingEnabled,
        align: emailSettings.brandingAlign,
        accentColor: emailSettings.brandingAccentColor,
        backgroundColor: emailSettings.brandingBackgroundColor,
      }}
    />
  );
}
