import ConsoleEmailSending from "@/components/ConsoleEmailSending";
import { SITE_HOSTNAME } from "@/lib/liveSiteUrl";
import { getEmailSettings } from "@/lib/emailSettings";

export default async function EmailSendingPage() {
  const settings = await getEmailSettings();
  return <ConsoleEmailSending defaultDomain={SITE_HOSTNAME} sendingDomain={settings.sendingDomain} />;
}
