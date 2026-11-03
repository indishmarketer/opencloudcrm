import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { parsePositiveId } from "@/lib/courseStudio";
import { rotateWorkflowWebhookToken } from "@/lib/workflows";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parsePositiveId((await params).id);
  if (!id) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const token = await rotateWorkflowWebhookToken(id);
  if (!token) return NextResponse.json({ error: "This workflow does not use an incoming webhook trigger." }, { status: 400 });
  return NextResponse.json({ webhookUrl: `/api/automation/inbound/${token}` });
}
