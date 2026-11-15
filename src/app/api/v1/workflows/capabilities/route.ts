import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { EMAIL_BLOCK_DEFS } from "@/lib/emailBlocks";
import { SENDER_ADDRESSES } from "@/lib/emailSenders";
import { EMAIL_ATTRIBUTES } from "@/lib/messageVariables";
import { WORKFLOW_NODE_KINDS, workflowTriggerOptions } from "@/lib/workflowGraph";

/** The current console vocabulary, shared with local and remote MCP clients. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "workflows:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    triggers: workflowTriggerOptions,
    nodeKinds: WORKFLOW_NODE_KINDS,
    emailAttributes: EMAIL_ATTRIBUTES.map((attribute) => ({ ...attribute, syntax: `{{${attribute.token}}}` })),
    emailBlocks: EMAIL_BLOCK_DEFS,
    senderAddresses: SENDER_ADDRESSES,
    graphShape: {
      nodes: [{ id: "trigger-1", type: "workflow", position: { x: 0, y: 0 }, data: { kind: "trigger", label: "Trigger", config: { triggerKey: "directory_tool.submitted" } } },
        { id: "email-1", type: "workflow", position: { x: 320, y: 0 }, data: { kind: "email", label: "Receipt", config: { to: "{{contact.email}}", from: SENDER_ADDRESSES[0].value, contentMode: "custom", subject: "We received {{data.tool_name}}", body: "<p>Hi {{first_name}},</p><p>We received your submission.</p>", messageType: "transactional" } } }],
      edges: [{ id: "trigger-email", source: "trigger-1", target: "email-1" }],
    },
    notes: [
      "Use a trigger value from triggers for the triggerKey on both the workflow and trigger node.",
      "The email node stores custom HTML in config.body, or uses contentMode template with templateKind fixed/library and templateKey.",
      "Event data attributes resolve only when that event supplies the matching field; contact attributes use the recipient record.",
      "Use sourceHandle true and false for condition branches; save as draft, inspect readiness errors, then activate.",
    ],
  });
}
