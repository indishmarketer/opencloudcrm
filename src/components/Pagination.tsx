import Link from "next/link";

export default function Pagination({
  currentPage,
  totalPages,
  basePath,
}: {
  currentPage: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const createPageUrl = (page: number) => {
    return `${basePath}?page=${page}`;
  };

  return (
    <div className="mt-16 flex items-center justify-center gap-2">
      {currentPage > 1 ? (
        <Link
          href={createPageUrl(currentPage - 1)}
          className="flex h-10 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-medium text-ink transition-colors hover:border-ink/50"
        >
          &larr; Previous
        </Link>
      ) : (
        <span className="flex h-10 items-center justify-center rounded-full border border-line/50 bg-paper px-4 text-sm font-medium text-ink-soft opacity-50 cursor-not-allowed">
          &larr; Previous
        </span>
      )}

      <span className="mx-2 text-sm font-medium text-ink-soft">
        Page {currentPage} of {totalPages}
      </span>

      {currentPage < totalPages ? (
        <Link
          href={createPageUrl(currentPage + 1)}
          className="flex h-10 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-medium text-ink transition-colors hover:border-ink/50"
        >
          Next &rarr;
        </Link>
      ) : (
        <span className="flex h-10 items-center justify-center rounded-full border border-line/50 bg-paper px-4 text-sm font-medium text-ink-soft opacity-50 cursor-not-allowed">
          Next &rarr;
        </span>
      )}
    </div>
  );
}
