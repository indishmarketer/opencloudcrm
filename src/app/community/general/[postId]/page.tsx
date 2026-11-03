import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getPost, listComments, isModeratorOrAdmin, isBanned } from "@/lib/community";
import CommentThread from "@/components/community/CommentThread";
import Avatar from "@/components/community/Avatar";
import DeletePostButton from "@/components/community/DeletePostButton";
import RichBody from "@/components/community/RichBody";
import LikeButton from "@/components/community/LikeButton";
import LevelBadge from "@/components/community/LevelBadge";
import BannedNotice from "@/components/community/BannedNotice";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, SITE_URL, OG_LOCALE } from "@/config/brand";

export async function generateMetadata({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const post = await getPost(Number(postId));
  if (!post || post.space !== "general" || post.status !== "approved") return { title: "Post" };
  const description = post.body.replace(/\s+/g, " ").trim().slice(0, 160);
  return {
    title: post.title,
    description,
    alternates: { canonical: `/community/general/${post.id}` },
    openGraph: { type: "article", title: post.title, description, url: `/community/general/${post.id}`, siteName: SITE_NAME, locale: OG_LOCALE },
  };
}

export default async function GeneralPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const id = Number(postId);
  if (!Number.isInteger(id)) notFound();

  const session = await getSession();
  if (session && (await isBanned(session.userId))) return <BannedNotice />;

  const post = await getPost(id, session?.userId);
  if (!post || post.space !== "general") notFound();

  const isMod = session ? await isModeratorOrAdmin(session.userId) : false;
  if (post.status !== "approved" && post.user_id !== session?.userId && !isMod) notFound();

  const comments = await listComments(id, { viewerUserId: session?.userId, viewerIsModerator: isMod });
  const canonicalUrl = `${SITE_URL}/community/general/${post.id}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": `${canonicalUrl}#post`,
    url: canonicalUrl,
    headline: post.title,
    text: post.body,
    datePublished: post.created_at,
    author: {
      "@type": "Person",
      name: post.author_name || post.author_username || "Community member",
      ...(post.author_username ? { url: `${SITE_URL}/community/${post.author_username}` } : {}),
    },
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: post.like_count },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: comments.length },
    ],
    comment: comments.map((comment) => ({
      "@type": "Comment",
      text: comment.body,
      dateCreated: comment.created_at,
      author: {
        "@type": "Person",
        name: comment.author_name || comment.author_username || "Community member",
        ...(comment.author_username ? { url: `${SITE_URL}/community/${comment.author_username}` } : {}),
      },
    })),
    isPartOf: { "@type": "WebSite", name: `${SITE_NAME} Community`, url: `${SITE_URL}/community/general` },
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <Link href="/community/general" className="text-sm text-ink-soft hover:text-ink">
        ← Back to Community
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
          {session && (
            <LikeButton
              postId={post.id}
              initialLiked={post.user_liked}
              initialCount={post.like_count}
            />
          )}
          {(post.user_id === session?.userId || isMod) && (
            <DeletePostButton postId={post.id} space="general" />
          )}
        </div>
      </div>
      <RichBody text={post.body} className="mt-4" />

      <div className="mt-10">
        {session ? (
          <CommentThread
            postId={id}
            comments={comments}
            currentUserId={session?.userId}
            isModerator={isMod}
          />
        ) : (
          <Link
            href={`/login?redirect=/community/general/${id}`}
            className="block w-full rounded-xl border border-line bg-paper px-5 py-4 text-center text-sm text-ink-soft transition-colors hover:border-ink"
          >
            Log in to comment
          </Link>
        )}
        {!session && comments.length > 0 && (
          <div className="mt-6 space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="rounded-xl border border-line bg-paper p-4">
                <p className="text-xs font-medium text-ink-soft">
                  {c.author_username ? (
                    <Link href={`/community/${c.author_username}`} className="hover:text-ink hover:underline">
                      {c.author_name || c.author_username}
                    </Link>
                  ) : (
                    c.author_name || "Member"
                  )}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
