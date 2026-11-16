import AutoPopups from "@/components/AutoPopups";
import PageBlocks from "@/components/pageBlocks/PageBlocks";
import { listPopups } from "@/lib/popups";

/** Every popup set to open by itself, rendered server-side with the normal
 * page renderer (so forms inside them work exactly as on a page) and
 * handed to the client opener. Which page, audience and timing apply is
 * decided in the browser (AutoPopups) so pages stay cacheable. */
export default async function SiteAutoPopups() {
  const popups = (await listPopups().catch(() => [])).filter((popup) => popup.settings.autoOpen && popup.blocks.length > 0);
  if (!popups.length) return null;
  return <AutoPopups popups={popups.map((popup) => ({ id: popup.id, settings: popup.settings, content: <PageBlocks blocks={popup.blocks} /> }))} />;
}
