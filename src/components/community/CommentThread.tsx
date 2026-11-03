"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Comment } from "@/lib/community";
import Avatar from "@/components/community/Avatar";
import LevelBadge from "@/components/community/LevelBadge";
import { timeAgo } from "@/lib/timeAgo";
import { useConfirm } from "@/components/ConfirmDialog";
import { trackEvent } from "@/lib/gtag";

function AuthorName({ name, username, points }: { name: string | null; username: string | null; points?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {username ? (
        <Link href={`/community/${username}`} className="font-medium text-ink hover:underline">
          {name || username}
        </Link>
      ) : (
        <span className="font-medium text-ink">{name || "Member"}</span>
      )}
      <LevelBadge points={points || 0} size="sm" />
    </div>
  );
}

function DeleteCommentButton({ commentId, onDeleted }: { commentId: number; onDeleted: () => void }) {
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    const ok = await confirm({ message: "Delete this comment? This can't be undone." });
    if (!ok) return;
    const res = await fetch(`/api/community/comments/${commentId}`, { method: "DELETE" });
    if (res.ok) onDeleted();
  }
  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        className="text-xs font-medium text-red-600 underline hover:text-red-700"
      >
        Delete
      </button>
      {dialog}
    </>
  );
}

function CommentForm({ postId, parentCommentId }: { postId: number; parentCommentId?: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value;

    try {
      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentCommentId }),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseBody.error || "Something went wrong.");
      trackEvent("community_comment_created", {
        post_id: String(postId),
        comment_type: parentCommentId ? "reply" : "comment",
      });
      form.reset();
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Write a comment…"
        className="w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting" ? "Posting…" : "Comment"}
      </button>
    </form>
  );
}

export default function CommentThread({
  postId,
  comments,
  currentUserId,
  isModerator,
}: {
  postId: number;
  comments: Comment[];
  currentUserId?: number;
  isModerator?: boolean;
}) {
  const router = useRouter();
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesFor = (id: number) => comments.filter((c) => c.parent_comment_id === id);
  const canDelete = (c: Comment) => c.user_id === currentUserId || !!isModerator;

  return (
    <div className="space-y-6">
      <CommentForm postId={postId} />
      <div className="space-y-5">
        {topLevel.map((c) => (
          <div key={c.id}>
            <div className="rounded-xl border border-line bg-paper p-4">
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <Avatar url={c.author_avatar_url} name={c.author_name || c.author_username} size={20} />
                <AuthorName name={c.author_name} username={c.author_username} points={c.author_community_points} />
                <span>{timeAgo(c.created_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                  className="text-xs font-medium text-ink-soft underline hover:text-ink"
                >
                  Reply
                </button>
                {canDelete(c) && (
                  <DeleteCommentButton commentId={c.id} onDeleted={() => router.refresh()} />
                )}
              </div>
            </div>
            {repliesFor(c.id).map((r) => (
              <div key={r.id} className="ml-6 mt-3 rounded-xl border border-line bg-paper-soft p-4">
                <div className="flex items-center gap-2 text-xs text-ink-soft">
                  <Avatar url={r.author_avatar_url} name={r.author_name || r.author_username} size={20} />
                  <AuthorName name={r.author_name} username={r.author_username} points={r.author_community_points} />
                  <span>{timeAgo(r.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
                {canDelete(r) && (
                  <div className="mt-2">
                    <DeleteCommentButton commentId={r.id} onDeleted={() => router.refresh()} />
                  </div>
                )}
              </div>
            ))}
            {replyTo === c.id && (
              <div className="ml-6 mt-3">
                <CommentForm postId={postId} parentCommentId={c.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
