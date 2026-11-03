"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LikeButton({
  postId,
  initialLiked,
  initialCount,
}: {
  postId: number;
  initialLiked: boolean;
  initialCount: number;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, setIsPending] = useState(false);

  async function handleToggle() {
    if (isPending) return;
    setIsPending(true);
    const newLiked = !liked;
    
    // Optimistic update
    setLiked(newLiked);
    setCount((c) => (newLiked ? c + 1 : c - 1));

    try {
      const res = await fetch(`/api/community/posts/${postId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ like: newLiked }),
      });
      if (!res.ok) throw new Error("Failed");
      router.refresh();
    } catch {
      // Revert on error
      setLiked(!newLiked);
      setCount((c) => (!newLiked ? c + 1 : c - 1));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        liked
          ? "border-red-600 text-red-600 bg-paper hover:bg-paper-soft"
          : "border-line text-ink-soft hover:border-ink hover:text-ink bg-paper"
      }`}
    >
      <svg
        className="h-4 w-4"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={liked ? 0 : 2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
      {count}
    </button>
  );
}
