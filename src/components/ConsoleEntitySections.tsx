import { getAdminSessionEmail } from "@/lib/auth";
import { getOrCreateEditablePage } from "@/lib/sitePages";
import { hasUnpublishedChanges } from "@/lib/sitePagesShape";
import { getPageLinkOptions } from "@/lib/pageLinkOptions";
import { getPageEditorLiveData } from "@/lib/pageEditorLiveData";
import ConsolePageEditor from "@/components/ConsolePageEditor";

/** The page-builder editor for a course's or tool's extra page sections,
 * creating its (empty, draft) record the first time it's opened. */
export default async function ConsoleEntitySections({
  kind,
  refId,
  title,
  backHref,
  backLabel,
  publicUrl,
}: {
  kind: "course" | "tool";
  refId: string;
  title: string;
  backHref: string;
  backLabel: string;
  publicUrl: string;
}) {
  const actor = (await getAdminSessionEmail()) || "console";
  const page = await getOrCreateEditablePage({ kind, refId, title }, actor);
  return (
    <ConsolePageEditor
      initialPage={{ ...page, builtIn: false, hasUnpublishedChanges: hasUnpublishedChanges(page) }}
      linkOptions={await getPageLinkOptions()}
      backHref={backHref}
      backLabel={backLabel}
      publicUrl={publicUrl}
      liveData={await getPageEditorLiveData()}
    />
  );
}
