import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { EMAIL_ATTRIBUTES } from "@/lib/messageVariables";
import { EMAIL_BLOCK_DEFS } from "@/lib/emailBlocks";

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "email:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    attributes: EMAIL_ATTRIBUTES.map((attribute) => ({ ...attribute, syntax: `{{${attribute.token}}}` })),
    blocks: EMAIL_BLOCK_DEFS,
    note: "Contact values resolve for recipient messages. data.* values require a matching workflow event payload; campaign broadcasts may not supply them.",
  });
}
