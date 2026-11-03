"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Category, Space } from "@/lib/community";

export default function CategoryFilterBar({ space, categories }: { space: Space; categories: Category[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("category") || "";

  function go(slug: string) {
    router.push(slug ? `/community/${space}?category=${slug}` : `/community/${space}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => go("")}
        className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
          active === "" ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink"
        }`}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => go(c.slug)}
          className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
            active === c.slug ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink"
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
