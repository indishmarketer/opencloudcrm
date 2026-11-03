import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listChats } from "@/lib/messages";
import Avatar from "@/components/community/Avatar";
import { timeAgo } from "@/lib/timeAgo";

import SpaceSwitcher from "@/components/community/SpaceSwitcher";
import CommunityHero from "@/components/community/CommunityHero";

export const metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export default async function MessagesPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/community/messages");

  const chats = await listChats(session.userId);

  return (
    <div>
      <CommunityHero
        title="Messages"
        description="Chat with other members and admins directly."
      />
      <div className="border-b border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6">
          <SpaceSwitcher active="messages" isModerator={false} />
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl font-semibold">Inbox</h2>
        </div>

      {chats.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper py-12 text-center text-ink-soft">
          You have no messages yet.
          <br />
          Go to someone&apos;s profile to send them a message!
        </div>
      ) : (
        <div className="space-y-4">
          {chats.map((chat) => (
            <Link
              key={chat.other_user_id}
              href={`/community/messages/${chat.username || chat.other_user_id}`}
              className="flex items-center gap-4 rounded-2xl border border-line bg-paper p-4 transition-colors hover:border-ink"
            >
              <Avatar url={chat.avatar_url} name={chat.name || chat.username} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink truncate">
                    {chat.name || chat.username || "Member"}
                  </p>
                  <span className="text-xs text-ink-soft shrink-0">
                    {timeAgo(chat.last_message_at)}
                  </span>
                </div>
                <p className={`mt-1 text-sm truncate ${chat.unread_count > 0 ? 'font-medium text-ink' : 'text-ink-soft'}`}>
                  {chat.last_message_body}
                </p>
              </div>
              {chat.unread_count > 0 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-medium text-paper">
                  {chat.unread_count}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
