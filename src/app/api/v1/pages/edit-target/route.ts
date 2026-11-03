import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { getOrCreateEditablePage, PageError } from "@/lib/sitePages";
import { pool } from "@/lib/db";
import { normalizePagePath } from "@/lib/sitePagesShape";
import { actorOf, pageErrorResponse, unauthorized } from "@/lib/pagesApi";

/** Returns the editable page record for a built-in page ({ path }), a
 * course ({ kind: "course", refId }) or a tool ({ kind: "tool", refId }),
 * creating it from defaults the first time. */
export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, "pages:write");
  if (!auth.ok) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (body.kind === "course" || body.kind === "tool") {
      const refId = String(body.refId ?? "");
      const table = body.kind === "course" ? "courses" : "directory_tools";
      const found = await pool.query<{ title: string }>(
        `SELECT ${body.kind === "course" ? "title" : "name"} AS title FROM ${table} WHERE id::text = $1`,
        [refId]
      );
      if (!found.rows[0]) throw new PageError(`No ${body.kind} with that id.`, 404);
      const page = await getOrCreateEditablePage({ kind: body.kind, refId, title: found.rows[0].title }, actorOf(auth));
      return NextResponse.json({ page });
    }
    const page = await getOrCreateEditablePage({ kind: "page", path: normalizePagePath(body.path) }, actorOf(auth));
    return NextResponse.json({ page });
  } catch (error) {
    return pageErrorResponse(error);
  }
}
