"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { BlogComment } from "@/lib/community";
import { useConfirm } from "@/components/ConfirmDialog";
import { trackEvent } from "@/lib/gtag";

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function AuthorName({ name, username }: { name: string | null; username: string | null }) {
  if (!username) return <span className="font-medium text-ink">{name || "Member"}</span>;
  return (
    <Link href={`/community/${username}`} className="font-medium text-ink hover:underline">
      {name || username}
    </Link>
  );
}

function DeleteCommentButton({ commentId, onDeleted }: { commentId: number; onDeleted: () => void }) {
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    const ok = await confirm({ message: "Delete this comment? This can't be undone." });
    if (!ok) return;
    const res = await fetch(`/api/blog-comments/${commentId}`, { method: "DELETE" });
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

/** Blog post pages are statically pre-rendered, so login state and comments
 * are fetched client-side here rather than in the page itself -- keeps the
 * page fully static instead of forcing dynamic rendering on every post. */
export default function BlogCommentSection({ postSlug }: { postSlug: string }) {
  const [comments, setComments] = useState<BlogComment[] | null>(null);
  const [me, setMe] = useState<{ userId: number; isModerator: boolean } | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/blog-comments?slug=${encodeURIComponent(postSlug)}`);
    const body = await res.json().catch(() => ({}));
    return body.comments || [];
  }, [postSlug]);

  useEffect(() => {
    let cancelled = false;
    fetchComments().then((c) => {
      if (!cancelled) setComments(c);
    });
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setMe(body.user ? { userId: body.user.userId, isModerator: body.user.isModerator } : null);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchComments]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value;

    try {
      const res = await fetch("/api/blog-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postSlug, body }),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseBody.error || "Something went wrong.");
      trackEvent("blog_comment_created", { post_slug: postSlug });
      form.reset();
      setStatus("idle");
      setComments(await fetchComments());
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="mt-12">
      <h2 className="font-display text-xl font-semibold">
        {comments && comments.length > 0 ? `${comments.length} comments` : "Comments"}
      </h2>

      <div className="mt-6">
        {me ? (
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
        ) : (
          <Link
            href={`/login?redirect=/blog/${postSlug}`}
            className="block w-full rounded-xl border border-line bg-paper px-5 py-4 text-center text-sm text-ink-soft transition-colors hover:border-ink"
          >
            Log in to comment
          </Link>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {(comments || []).map((c) => (
          <div key={c.id} className="rounded-xl border border-line bg-paper p-4">
            <div className="flex items-center gap-2 text-xs text-ink-soft">
              <AuthorName name={c.author_name} username={c.author_username} />
              <span>{timeAgo(c.created_at)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            {me && (c.user_id === me.userId || me.isModerator) && (
              <div className="mt-2">
                <DeleteCommentButton
                  commentId={c.id}
                  onDeleted={() => fetchComments().then(setComments)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
