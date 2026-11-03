import DirectoryToolCard, { type DirectoryToolCardData } from "@/components/DirectoryToolCard";

export default function RelatedTools({ tools }: { tools: DirectoryToolCardData[] }) {
  if (tools.length === 0) return null;

  return (
    <div className="mt-16 border-t border-line pt-10">
      <h2 className="font-display text-xl font-semibold">Tools mentioned in this post</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {tools.map((t) => (
          <DirectoryToolCard key={t.slug} tool={t} />
        ))}
      </div>
    </div>
  );
}
