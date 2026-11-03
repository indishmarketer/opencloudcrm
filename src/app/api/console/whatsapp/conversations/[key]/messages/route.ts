import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { parseConversationKey, replyWindow } from "@/lib/whatsappContacts";
import { loadThreadMessages } from "@/lib/whatsappThread";

/** The newest slice of a conversation, for the open thread to poll.
 *
 * A chat that only updates when the page is reloaded is not a chat. This
 * returns the same shape the page renders, from the same loader, so the
 * live view can never drift from the rendered one.
 *
 * It returns the whole newest page rather than only what is new, because
 * existing messages change too: a message moves from sent to delivered to
 * read minutes after it was sent, and those ticks are most of the point. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseConversationKey((await params).key);
  if (!parsed) return NextResponse.json({ error: "Unknown conversation." }, { status: 400 });

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const [{ messages }, window] = await Promise.all([loadThreadMessages(parsed, page), replyWindow(parsed)]);

  // The reply window closes on a timer, so the box has to be able to
  // disable itself without a reload too.
  return NextResponse.json(
    { messages, windowOpen: window.open },
    { headers: { "Cache-Control": "no-store" } },
  );
}
