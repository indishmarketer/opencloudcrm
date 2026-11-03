import Image from "next/image";

export default function WebinarArtwork({
  title,
  thumbnailUrl,
  playbackId,
  priority = false,
  sizes = "(max-width: 768px) 100vw, 44vw",
}: {
  title: string;
  thumbnailUrl: string | null;
  playbackId?: string | null;
  priority?: boolean;
  sizes?: string;
}) {
  const imageUrl = thumbnailUrl || (playbackId ? `/api/webinars/${encodeURIComponent(playbackId)}/thumbnail` : null);
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl border border-line bg-ink">
      {imageUrl ? (
        <Image src={imageUrl} alt={`${title} webinar cover`} fill priority={priority} sizes={sizes} className="object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between overflow-hidden p-6 text-paper">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full border border-paper/15" />
          <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full border border-paper/10" />
          <span className="relative text-xs font-semibold uppercase tracking-[0.2em] text-paper/60">On-demand webinar</span>
          <p className="relative max-w-[85%] font-display text-xl font-semibold leading-tight sm:text-2xl">{title}</p>
        </div>
      )}
      <span className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-paper text-ink shadow-lg" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </span>
    </div>
  );
}
