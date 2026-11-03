import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { unpublishPage } from "@/lib/sitePages";
import { actorOf, pageErrorResponse, parseId, unauthorized } from "@/lib/pagesApi";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(req, "pages:write");
  if (!auth.ok) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  try {
    return NextResponse.json({ page: await unpublishPage(id, actorOf(auth)) });
  } catch (error) {
    return pageErrorResponse(error);
  }
}
