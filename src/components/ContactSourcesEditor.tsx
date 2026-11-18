"use client";

type Source = { label: string; path: string | null };

/** The contact's source is system attribution, not an owner-editable field. */
export default function ContactSourcesEditor({ initialSources }: { initialSources: Source[] }) {
  const tag = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs font-normal text-ink-soft";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1">
        {!initialSources.length && <span className={tag}>Unknown</span>}
        {initialSources.map((source) => (
          <span key={source.label} className={tag}>
            {source.path ? <a href={source.path} target="_blank" rel="noreferrer" title={`Opens ${source.path}`} className="hover:text-ink">{source.label}</a> : source.label}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-ink-soft">Captured automatically from the visitor’s first known page.</p>
    </div>
  );
}
