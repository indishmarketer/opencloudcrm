import Link from "next/link";
import type { Post, Space } from "@/lib/community";
import Avatar from "@/components/community/Avatar";
import LevelBadge from "@/components/community/LevelBadge";
import { timeAgo } from "@/lib/timeAgo";
import { firstImageUrl, stripImageMarkers } from "@/components/community/RichBody";

export default function PostCard({ post, space }: { post: Post; space: Space }) {
  const thumbnail = firstImageUrl(post.body);
  const snippet = stripImageMarkers(post.body);

  return (
    <Link
      href={`/community/${space}/${post.id}`}
      className="block rounded-2xl border border-line bg-paper p-5 transition-colors hover:border-ink"
    >
      <div className="flex items-start gap-3">
        <Avatar url={post.author_avatar_url} name={post.author_name || post.author_username} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <span className="font-medium text-ink">{post.author_name || post.author_username || "Member"}</span>
            <LevelBadge points={post.author_community_points || 0} size="sm" />
            <span>·</span>
            <span>{timeAgo(post.created_at)}</span>
            {post.pinned && (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium text-paper">Pinned</span>
            )}
            {post.category_name && (
              <span className="rounded-full border border-line px-2 py-0.5">{post.category_name}</span>
            )}
            {post.status === "pending" && (
              <span className="rounded-full border border-line px-2 py-0.5">Pending approval</span>
            )}
          </div>
          <p className="mt-1.5 font-display text-lg font-semibold">{post.title}</p>
          {snippet && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{snippet}</p>}
          {thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail} alt={`Thumbnail for ${post.title}`} className="mt-3 h-40 w-full rounded-lg border border-line object-cover" />
          )}
          <div className="mt-3 flex items-center gap-4 text-xs font-medium text-ink-soft">
            <span>
              {post.like_count} {post.like_count === 1 ? "like" : "likes"}
            </span>
            <span>
              {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
