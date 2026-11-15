import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { importWorkflow } from "@/lib/workflowShare";

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const text = await req.text();
  if (text.length > 2_000_000) return NextResponse.json({ error: "That file is too large to be a workflow." }, { status: 413 });
  let file: unknown;
  try { file = JSON.parse(text); } catch { return NextResponse.json({ error: "This isn't an OpenCloudCRM workflow file." }, { status: 400 }); }
  try {
    const workflow = await importWorkflow(file);
    return NextResponse.json({ workflow: { id: workflow.id, name: workflow.name } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import this workflow." }, { status: 400 });
  }
}
