import ConsoleWhatsAppTemplates from "@/components/ConsoleWhatsAppTemplates";
import {
  listTemplateGroups,
  listTemplateMedia,
  listWhatsAppTemplates,
} from "@/lib/whatsappTemplates";
import ModuleNotConfigured from "@/components/ModuleNotConfigured";
import { FEATURES } from "@/config/features";
import { listWhatsAppPhoneNumbers } from "@/lib/whatsappTemplates";
import { sendingNumbers } from "@/lib/whatsappSender";
import { getWhatsAppVariableMappings, listWhatsAppVariableSources } from "@/lib/whatsappVariableMappings";

export const dynamic = "force-dynamic";

export default async function WhatsAppTemplatesPage() {
  if (!FEATURES.whatsapp) return <ModuleNotConfigured title="WhatsApp isn't connected yet" envVars={["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WABA_ID"]} />;

  let templates;
  try {
    templates = await listWhatsAppTemplates();
  } catch (e) {
    return (
      <p className="rounded-2xl border border-line bg-paper-soft p-6 text-sm text-red-600">
        Could not reach WhatsApp: {e instanceof Error ? e.message : "unknown error"}
      </p>
    );
  }

  // Which file each media template sends, and which groups it is in;
  // Meta keeps neither, we do.
  const [mediaUrls, groups, numbers, routing, variableSources, variableMappings] = await Promise.all([
    listTemplateMedia().catch(() => ({})),
    listTemplateGroups().catch(() => ({})),
    listWhatsAppPhoneNumbers().catch(() => []),
    sendingNumbers(),
    listWhatsAppVariableSources(),
    Promise.all(templates.map(async (template) => [template.name, await getWhatsAppVariableMappings(template.name)] as const)),
  ]);
  const mappingsByName = Object.fromEntries(variableMappings);
  const templatesWithMappings = templates.map((template) => ({ ...template, variableMappings: mappingsByName[template.name] || [] }));

  // Which number each category actually goes out from, resolved here so the
  // template preview can say it: a category with no number of its own
  // follows whichever handles everything.
  const display = (id: string | null) => numbers.find((n) => n.id === id)?.display_phone_number || null;
  const sendsFrom = {
    MARKETING: display(routing.marketing || routing.default),
    UTILITY: display(routing.utility || routing.default),
    AUTHENTICATION: display(routing.authentication || routing.default),
  };

  return (
    <ConsoleWhatsAppTemplates
      templates={templatesWithMappings}
      variableSources={variableSources}
      mediaUrls={mediaUrls}
      groups={groups}
      sendsFrom={sendsFrom}
    />
  );
}
