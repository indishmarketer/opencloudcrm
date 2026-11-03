import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { deletePage, getPageById, updatePage } from "@/lib/sitePages";
import { BUILT_IN_PATHS } from "@/lib/defaultPages";
import { hasUnpublishedChanges } from "@/lib/sitePagesShape";
import { actorOf, pageErrorResponse, parseId, unauthorized } from "@/lib/pagesApi";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "pages:read");
  if (!auth.ok) return unauthorized();
  const id = parseId((await params).id);
  const page = id ? await getPageById(id) : null;
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  return NextResponse.json({
    page: { ...page, builtIn: page.kind === "page" && BUILT_IN_PATHS.has(page.path || ""), hasUnpublishedChanges: hasUnpublishedChanges(page) },
  });
}

/** Saves the working copy (any subset of title, path, blocks, metaTitle,
 * metaDescription, ogImage, noindex). Pass publish: true to make it live
 * in the same call, or status: "draft" to take a custom page offline. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "pages:write");
  if (!auth.ok) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  try {
    const page = await updatePage(id, await req.json().catch(() => ({})), actorOf(auth));
    return NextResponse.json({ page: { ...page, hasUnpublishedChanges: hasUnpublishedChanges(page) } });
  } catch (error) {
    return pageErrorResponse(error);
  }
}

/** Deletes a custom page. On a built-in page this resets it to defaults. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "pages:write");
  if (!auth.ok) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, ...(await deletePage(id)) });
  } catch (error) {
    return pageErrorResponse(error);
  }
}
