import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { exportWorkflow } from "@/lib/workflowShare";

/** Downloads the workflow as a shareable file (see workflowShare.ts for
 * what is stripped before it leaves this install). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const shared = Number.isInteger(id) && id > 0 ? await exportWorkflow(id) : null;
  if (!shared) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const filename = `${shared.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "workflow"}.opencloudcrm-workflow.json`;
  return new NextResponse(JSON.stringify(shared, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
