import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import type { Author } from "@/data/authors";

export default function AuthorByline({
  author,
  date,
}: {
  author: Author;
  date?: string;
}) {
  return (
    <Link href={`/author/${author.slug}`} className="group flex items-center gap-3">
      {author.avatar ? (
        <div className="relative h-10 w-10 overflow-hidden rounded-full">
          <SafeImage src={author.avatar} alt={author.name} fill className="object-cover" />
        </div>
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-paper">
          {author.name
            .split(" ")
            .map((n) => n[0])
            .join("")}
        </div>
      )}
      <div>
        <p className="text-sm font-medium group-hover:underline">{author.name}</p>
        <p className="text-xs text-ink-soft">
          {author.role}
          {date && <> &middot; {date}</>}
        </p>
      </div>
    </Link>
  );
}
