"use client";

import { useRouter } from "next/navigation";
import type { Post, PendingComment } from "@/lib/community";
import { stripImageMarkers } from "@/components/community/RichBody";

export default function ModerationQueue({
  posts,
  comments,
}: {
  posts: Post[];
  comments: PendingComment[];
}) {
  const router = useRouter();

  async function moderatePost(id: number, action: "approve" | "reject") {
    await fetch(`/api/community/admin/posts/${id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    router.refresh();
  }

  async function moderateComment(id: number, action: "approve" | "reject") {
    await fetch(`/api/community/admin/comments/${id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    router.refresh();
  }

  if (posts.length === 0 && comments.length === 0) {
    return <p className="text-sm text-ink-soft">Nothing waiting on approval.</p>;
  }

  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <div key={`post-${p.id}`} className="rounded-lg border border-line px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-ink-soft">
                Post in {p.space} · {p.author_name || p.author_username}
              </p>
              <p className="mt-1 font-medium">{p.title}</p>
              <p className="mt-1 line-clamp-2 text-ink-soft">{stripImageMarkers(p.body)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => moderatePost(p.id, "approve")}
                className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper hover:opacity-80"
              >
                Approve
              </button>
              <button
                onClick={() => moderatePost(p.id, "reject")}
                className="rounded-full border border-line px-3 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}

      {comments.map((c) => (
        <div key={`comment-${c.id}`} className="rounded-lg border border-line px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-ink-soft">
                Comment on &ldquo;{c.post_title}&rdquo; ({c.space}) · {c.author_name || c.author_username}
              </p>
              <p className="mt-1 line-clamp-2">{c.body}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => moderateComment(c.id, "approve")}
                className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper hover:opacity-80"
              >
                Approve
              </button>
              <button
                onClick={() => moderateComment(c.id, "reject")}
                className="rounded-full border border-line px-3 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
