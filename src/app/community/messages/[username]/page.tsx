import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getProfileByUsername } from "@/lib/community";
import { getMessages, markAsRead } from "@/lib/messages";
import ChatBox from "@/components/community/ChatBox";

export const metadata = {
  title: "Chat",
  robots: { index: false, follow: false },
};

export default async function ChatPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  
  const session = await getSession();
  if (!session) redirect(`/login?redirect=/community/messages/${username}`);

  const otherUser = await getProfileByUsername(username);
  if (!otherUser) notFound();

  // You can't chat with yourself
  if (otherUser.id === session.userId) {
    redirect("/community/messages");
  }

  // Mark messages from this user as read
  await markAsRead(session.userId, otherUser.id);

  const messages = await getMessages(session.userId, otherUser.id);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-4">
        <Link href="/community/messages" className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Back to Inbox
        </Link>
      </div>

      <ChatBox
        currentUserId={session.userId}
        otherUser={otherUser}
        initialMessages={messages}
      />
    </div>
  );
}
