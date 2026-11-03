import { SITE_URL, SITE_HOSTNAME, ASSET_DOMAIN } from "@/config/brand";

/** First embedded image URL in a body, if any -- for list-view thumbnails. */
export function firstImageUrl(text: string): string | null {
  const match = text.match(/!\[.*?\]\(([^)]+)\)/);
  return match ? match[1] : null;
}

/** Body text with image markers removed, for plain-text previews/snippets. */
export function stripImageMarkers(text: string): string {
  return text.replace(/!\[.*?\]\(([^)]+)\)/g, "").trim();
}

/** Renders a post/comment body where uploaded images are embedded as
 * `![alt](url)` markers, splitting them out into real <img> elements instead
 * of showing raw markdown or a bare attachment link. */
export default function RichBody({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/(!\[.*?\]\([^)]+\))/g);

  return (
    <div className={`space-y-4 ${className}`}>
      {parts.map((part, i) => {
        const match = part.match(/^!\[(.*?)\]\(([^)]+)\)$/);
        if (match) {
          const altText = match[1] || "Attached image";
          const src = match[2];
          let isAllowed = false;
          try {
            const url = new URL(src, SITE_URL);
            if (url.hostname === ASSET_DOMAIN || url.hostname === `www.${SITE_HOSTNAME}` || url.hostname === SITE_HOSTNAME) {
              isAllowed = true;
            }
          } catch {
            isAllowed = false;
          }

          if (!isAllowed) {
            return (
              <p key={i} className="whitespace-pre-wrap text-sm leading-6 italic text-muted">
                [External image removed]
              </p>
            );
          }

          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={altText}
              className="w-full rounded-xl border border-line object-cover"
            />
          );
        }
        if (!part.trim()) return null;
        return (
          <p key={i} className="whitespace-pre-wrap text-sm leading-6">
            {part.trim()}
          </p>
        );
      })}
    </div>
  );
}
