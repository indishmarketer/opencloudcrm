import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getPost, listComments, isModeratorOrAdmin, getUserProAccess, isBanned } from "@/lib/community";
import CommentThread from "@/components/community/CommentThread";
import Avatar from "@/components/community/Avatar";
import DeletePostButton from "@/components/community/DeletePostButton";
import RichBody from "@/components/community/RichBody";
import LikeButton from "@/components/community/LikeButton";
import LevelBadge from "@/components/community/LevelBadge";
import BannedNotice from "@/components/community/BannedNotice";

export async function generateMetadata({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const post = await getPost(Number(postId));
  return { title: post?.title || "Post", robots: { index: false, follow: false } };
}

export default async function ProPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const id = Number(postId);
  if (!Number.isInteger(id)) notFound();

  const session = await getSession();
  if (!session) redirect(`/login?redirect=${encodeURIComponent(`/community/pro/${id}`)}`);
  if (await isBanned(session.userId)) return <BannedNotice />;

  const isMod = await isModeratorOrAdmin(session.userId);
  const hasProAccess = isMod || (await getUserProAccess(session.userId));
  if (!hasProAccess) redirect("/community/pro");

  const post = await getPost(id, session.userId);
  if (!post || post.space !== "pro") notFound();
  if (post.status !== "approved" && post.user_id !== session.userId && !isMod) notFound();

  const comments = await listComments(id, { viewerUserId: session.userId, viewerIsModerator: isMod });

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/community/pro" className="text-sm text-ink-soft hover:text-ink">
        ← Back to PRO Community
      </Link>

      <div className="mt-4 flex items-center gap-2 text-xs text-ink-soft">
        <Avatar url={post.author_avatar_url} name={post.author_name || post.author_username} size={20} />
        {post.category_name && <span>{post.category_name}</span>}
        {post.status === "pending" && (
          <span className="rounded-full border border-line px-2 py-0.5">Pending approval</span>
        )}
        {post.author_username ? (
          <Link href={`/community/${post.author_username}`} className="hover:text-ink hover:underline font-medium text-ink">
            {post.author_name || post.author_username}
          </Link>
        ) : (
          <span className="font-medium text-ink">{post.author_name || "Member"}</span>
        )}
        <LevelBadge points={post.author_community_points || 0} size="sm" />
      </div>
      <div className="mt-2 flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold">{post.title}</h1>
        <div className="flex items-center gap-3">
          <LikeButton
            postId={post.id}
            initialLiked={post.user_liked}
            initialCount={post.like_count}
          />
          {(post.user_id === session.userId || isMod) && <DeletePostButton postId={post.id} space="pro" />}
        </div>
      </div>
      <RichBody text={post.body} className="mt-4" />

      <div className="mt-10">
        <CommentThread postId={id} comments={comments} currentUserId={session.userId} isModerator={isMod} />
      </div>
    </div>
  );
}
