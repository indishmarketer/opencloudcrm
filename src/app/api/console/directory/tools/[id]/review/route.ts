import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { reviewTool, sendApprovedEmail, type ReviewAction } from "@/lib/directoryReview";

const ACTIONS = ["approve", "request_changes", "reject", "send_approval_email"] as const;

/** Review decision on a tool submission. Every decision emails the
 * submitter (unless they're an admin). "send_approval_email" sends the
 * "your tool is live" email for a tool approved before it existed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const toolId = Number(id);
  if (!Number.isInteger(toolId)) return NextResponse.json({ error: "Invalid tool." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as (typeof ACTIONS)[number];
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  if (action === "send_approval_email") {
    const email = await sendApprovedEmail(toolId);
    return NextResponse.json({ ok: true, email });
  }

  const result = await reviewTool(toolId, action as ReviewAction, typeof body.note === "string" ? body.note : null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
