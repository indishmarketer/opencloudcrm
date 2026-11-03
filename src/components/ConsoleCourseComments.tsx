"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/community/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";
import { timeAgo } from "@/lib/timeAgo";
import type { ConsoleCourseComment } from "@/lib/courseAnalytics";

function CreatorBadge() {
  return (
    <span className="rounded-full border border-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
      Creator
    </span>
  );
}

function ReplyBox({ commentId, onDone }: { commentId: number; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/console/courses/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentCommentId: commentId, body }),
    });
    const response = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(response.error || "Could not post the reply.");
      return;
    }
    setBody("");
    onDone();
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        autoFocus
        placeholder="Write your reply…"
        className="w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy || !body.trim()}
        className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {busy ? "Posting…" : "Post reply"}
      </button>
    </div>
  );
}

export default function ConsoleCourseComments({
  courseSlug,
  comments,
}: {
  courseSlug: string;
  comments: ConsoleCourseComment[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState<"unanswered" | "all">("unanswered");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [error, setError] = useState("");

  const needsReply = (c: ConsoleCourseComment) => !c.author_is_creator && !c.creator_replied;
  const unanswered = comments.filter(needsReply);
  const visible = filter === "unanswered" ? unanswered : comments;

  async function remove(id: number, hasReplies: boolean) {
    const ok = await confirm({
      message: hasReplies
        ? "Delete this comment and all of its replies? This can't be undone."
        : "Delete this comment? This can't be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setError("");
    const res = await fetch(`/api/console/courses/comments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const response = await res.json().catch(() => ({}));
      setError(response.error || "Could not delete the comment.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Lesson comments</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Replies you post here appear on the lesson under your account with a Creator badge.
          </p>
        </div>
        <div className="flex gap-2">
          {(["unanswered", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink hover:text-ink"
              }`}
            >
              {f === "unanswered" ? `Needs reply (${unanswered.length})` : `All (${comments.length})`}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-4 rounded-lg border border-red-600 p-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 space-y-4">
        {visible.map((c) => (
          <div key={c.id} className="rounded-2xl border border-line bg-paper p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
              <Avatar url={c.author_avatar_url} name={c.author_name || c.author_username} size={24} />
              <span className="font-medium text-ink">{c.author_name || c.author_username || "Member"}</span>
              {c.author_is_creator && <CreatorBadge />}
              <span>{timeAgo(c.created_at)}</span>
              <span>·</span>
              <a
                href={`/account/courses/${courseSlug}/lessons/${c.lesson_id}#comment-${c.id}`}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-ink"
              >
                {c.lesson_title}
              </a>
              {needsReply(c) && <span className="font-medium text-red-600">Needs reply</span>}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>

            {c.replies.length > 0 && (
              <div className="ml-4 mt-3 space-y-2 border-l border-line pl-4">
                {c.replies.map((r) => (
                  <div key={r.id} className="text-sm">
                    <div className="flex items-center gap-2 text-xs text-ink-soft">
                      <Avatar url={r.author_avatar_url} name={r.author_name} size={20} />
                      <span className="font-medium text-ink">{r.author_name || "Member"}</span>
                      {r.author_is_creator && <CreatorBadge />}
                      <span>{timeAgo(r.created_at)}</span>
                      <button
                        type="button"
                        onClick={() => remove(r.id, false)}
                        className="text-red-600 underline hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{r.body}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-ink"
              >
                {replyingTo === c.id ? "Cancel" : "Reply"}
              </button>
              <button
                type="button"
                onClick={() => remove(c.id, c.replies.length > 0)}
                className="rounded-full border border-red-600 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
            {replyingTo === c.id && (
              <ReplyBox
                commentId={c.id}
                onDone={() => {
                  setReplyingTo(null);
                  router.refresh();
                }}
              />
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-sm text-ink-soft">
            {filter === "unanswered" ? "You're all caught up. No comments are waiting for a reply." : "No comments yet."}
          </p>
        )}
      </div>
      {dialog}
    </div>
  );
}
