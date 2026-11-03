"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CourseComment } from "@/lib/courses";
import Avatar from "@/components/community/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";
import { timeAgo } from "@/lib/timeAgo";
import { trackEvent } from "@/lib/gtag";

function AuthorName({ comment }: { comment: CourseComment }) {
  const label = comment.author_name || comment.author_username || "Member";
  return (
    <span className="flex items-center gap-1.5">
      {comment.author_username ? (
        <Link href={`/community/${comment.author_username}`} className="font-medium text-ink hover:underline">
          {label}
        </Link>
      ) : (
        <span className="font-medium text-ink">{label}</span>
      )}
      {comment.author_is_creator && (
        <span className="rounded-full border border-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
          Creator
        </span>
      )}
    </span>
  );
}

function DeleteCommentButton({
  commentId,
  hasReplies,
  onDeleted,
}: {
  commentId: number;
  hasReplies: boolean;
  onDeleted: () => void;
}) {
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    const ok = await confirm({
      message: hasReplies
        ? "Delete this comment and all of its replies? This can't be undone."
        : "Delete this comment? This can't be undone.",
    });
    if (!ok) return;
    const res = await fetch(`/api/course-comments/${commentId}`, { method: "DELETE" });
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

function CommentForm({
  lessonId,
  parentCommentId,
  placeholder,
  submitLabel,
  autoFocus,
  onPosted,
  onCancel,
}: {
  lessonId: number;
  parentCommentId?: number;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onPosted: () => void;
  onCancel?: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value;

    try {
      const res = await fetch("/api/course-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, body, parentCommentId }),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseBody.error || "Something went wrong.");
      trackEvent("course_comment_created", {
        lesson_id: String(lessonId),
        comment_type: parentCommentId ? "reply" : "comment",
      });
      form.reset();
      setStatus("idle");
      onPosted();
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
        rows={parentCommentId ? 2 : 3}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {status === "submitting" ? "Posting…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-ink-soft hover:text-ink">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function CommentCard({
  comment,
  nested,
  canDelete,
  hasReplies,
  canReply,
  onReply,
  onDeleted,
}: {
  comment: CourseComment;
  nested?: boolean;
  canDelete: boolean;
  hasReplies: boolean;
  canReply: boolean;
  onReply: () => void;
  onDeleted: () => void;
}) {
  return (
    <div
      id={`comment-${comment.id}`}
      className={`scroll-mt-24 rounded-xl border border-line p-4 ${nested ? "bg-paper-soft" : "bg-paper"}`}
    >
      <div className="flex items-center gap-2 text-xs text-ink-soft">
        <Avatar url={comment.author_avatar_url} name={comment.author_name || comment.author_username} size={24} />
        <AuthorName comment={comment} />
        <span>{timeAgo(comment.created_at)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p>
      {(canReply || canDelete) && (
        <div className="mt-2 flex items-center gap-3">
          {canReply && (
            <button
              type="button"
              onClick={onReply}
              className="text-xs font-medium text-ink-soft underline hover:text-ink"
            >
              Reply
            </button>
          )}
          {canDelete && <DeleteCommentButton commentId={comment.id} hasReplies={hasReplies} onDeleted={onDeleted} />}
        </div>
      )}
    </div>
  );
}

export default function CourseCommentSection({ lessonId }: { lessonId: number }) {
  const [comments, setComments] = useState<CourseComment[] | null>(null);
  const [me, setMe] = useState<{ userId: number; isModerator: boolean } | null>(null);
  // The top-level thread the reply box is open under.
  const [replyThread, setReplyThread] = useState<number | null>(null);
  // The specific comment being answered (may be a reply inside that thread).
  const [replyTarget, setReplyTarget] = useState<CourseComment | null>(null);

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/course-comments?lessonId=${lessonId}`);
    const body = await res.json().catch(() => ({}));
    return (body.comments || []) as CourseComment[];
  }, [lessonId]);

  const refresh = useCallback(() => fetchComments().then(setComments), [fetchComments]);

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

  // Comments load client-side, so the browser's own #comment-N jump (from a
  // notification link) fires before the target exists.
  useEffect(() => {
    if (!comments?.length || !window.location.hash.startsWith("#comment-")) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [comments]);

  const list = comments || [];
  const topLevel = list.filter((c) => !c.parent_comment_id);
  const repliesFor = (id: number) => list.filter((c) => c.parent_comment_id === id);
  const canDelete = (c: CourseComment) => !!me && (c.user_id === me.userId || me.isModerator);

  function openReply(threadId: number, target: CourseComment) {
    setReplyThread(threadId);
    setReplyTarget(target);
  }

  function closeReply() {
    setReplyThread(null);
    setReplyTarget(null);
  }

  return (
    <div className="mt-12">
      <h2 className="font-display text-xl font-semibold">
        {list.length > 0 ? `${list.length} ${list.length === 1 ? "comment" : "comments"}` : "Comments"}
      </h2>

      <div className="mt-6">
        {me ? (
          <CommentForm
            lessonId={lessonId}
            placeholder="Ask a question or share a thought…"
            submitLabel="Comment"
            onPosted={refresh}
          />
        ) : (
          <p className="text-sm text-ink-soft">Log in to comment.</p>
        )}
      </div>

      <div className="mt-6 space-y-5">
        {topLevel.map((c) => {
          const replies = repliesFor(c.id);
          return (
            <div key={c.id}>
              <CommentCard
                comment={c}
                canDelete={canDelete(c)}
                hasReplies={replies.length > 0}
                canReply={!!me}
                onReply={() => openReply(c.id, c)}
                onDeleted={refresh}
              />
              {replies.length > 0 && (
                <div className="ml-6 mt-3 space-y-3 border-l border-line pl-4">
                  {replies.map((r) => (
                    <CommentCard
                      key={r.id}
                      comment={r}
                      nested
                      canDelete={canDelete(r)}
                      hasReplies={false}
                      canReply={!!me}
                      onReply={() => openReply(c.id, r)}
                      onDeleted={refresh}
                    />
                  ))}
                </div>
              )}
              {replyThread === c.id && replyTarget && (
                <div className="ml-6 mt-3 pl-4">
                  <CommentForm
                    key={replyTarget.id}
                    lessonId={lessonId}
                    parentCommentId={replyTarget.id}
                    placeholder={`Reply to ${replyTarget.author_name || replyTarget.author_username || "this comment"}…`}
                    submitLabel="Reply"
                    autoFocus
                    onPosted={() => {
                      closeReply();
                      refresh();
                    }}
                    onCancel={closeReply}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
