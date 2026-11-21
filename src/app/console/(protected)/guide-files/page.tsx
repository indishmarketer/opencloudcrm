import ConsoleGuideDocuments from "@/components/ConsoleGuideDocuments";
import { listGuideDocuments } from "@/lib/guideDocuments";

export const dynamic = "force-dynamic";

export default async function ConsoleGuideFilesPage() {
  const documents = await listGuideDocuments();
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Free guide files</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-soft">
        This is a document library, not a page editor. Upload files, copy their public links, and select the one
        delivered by the homepage popup. The popup copy and cover image live in the website code.
      </p>
      <div className="mt-8">
        <ConsoleGuideDocuments documents={documents} />
      </div>
    </div>
  );
}
