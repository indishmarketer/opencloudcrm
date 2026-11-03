import { NextRequest, NextResponse } from "next/server";
import { queueInboundWorkflowRun } from "@/lib/workflows";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^wf_[A-Za-z0-9_-]{40,80}$/.test(token)) return NextResponse.json({ error: "Webhook not found." }, { status: 404 });
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > 1_000_000) return NextResponse.json({ error: "Payload is too large." }, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Send a JSON request body." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "The JSON payload must be an object." }, { status: 400 });
  }
  const queued = await queueInboundWorkflowRun(token, payload);
  if (!queued) return NextResponse.json({ error: "Webhook not found or workflow is paused." }, { status: 404 });
  return NextResponse.json({ ok: true, runId: queued.runId }, { status: 202 });
}
