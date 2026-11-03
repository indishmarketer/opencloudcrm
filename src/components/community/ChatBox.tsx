"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DirectMessage } from "@/lib/messages";
import Avatar from "@/components/community/Avatar";
import { trackEvent } from "@/lib/gtag";

export default function ChatBox({
  currentUserId,
  otherUser,
  initialMessages,
}: {
  currentUserId: number;
  otherUser: { id: number; name: string | null; username: string | null; avatar_url: string | null };
  initialMessages: DirectMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || sending) return;

    setSending(true);
    const tempBody = body;
    setBody("");

    // Optimistic append
    const tempMsg: DirectMessage = {
      id: Date.now(),
      sender_id: currentUserId,
      receiver_id: otherUser.id,
      body: tempBody,
      read_at: null,
      created_at: new Date().toISOString(),
      sender_username: null,
      sender_name: null,
      sender_avatar: null,
      receiver_username: otherUser.username,
      receiver_name: otherUser.name,
      receiver_avatar: otherUser.avatar_url,
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await fetch("/api/community/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: otherUser.id, body: tempBody }),
      });
      if (!res.ok) throw new Error("Failed");
      trackEvent("community_message_sent");
      router.refresh();
    } catch {
      // Revert on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setBody(tempBody);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border border-line bg-paper">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line p-4">
        <Avatar url={otherUser.avatar_url} name={otherUser.name || otherUser.username} size={40} />
        <div>
          <p className="font-medium text-ink">{otherUser.name || otherUser.username || "Member"}</p>
          <p className="text-xs text-ink-soft">@{otherUser.username}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => {
          const isMe = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  isMe ? "bg-ink text-paper rounded-br-none" : "bg-paper-soft border border-line rounded-bl-none"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-line p-4">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
            required
          />
          <button
            type="submit"
            disabled={!body.trim() || sending}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
