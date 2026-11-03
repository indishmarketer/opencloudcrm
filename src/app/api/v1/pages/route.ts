import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { createPage, listPagesWithBuiltIns } from "@/lib/sitePages";
import { hasUnpublishedChanges } from "@/lib/sitePagesShape";
import { actorOf, pageErrorResponse, unauthorized } from "@/lib/pagesApi";

/** Every page: custom pages, the homepage, and built-in pages (the ones
 * never edited are listed with id null -- edit them via
 * POST /api/v1/pages/edit-target { path }). Blocks are left out here;
 * GET /api/v1/pages/:id has them. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "pages:read");
  if (!auth.ok) return unauthorized();
  try {
    const { pages, untouchedBuiltIns } = await listPagesWithBuiltIns();
    return NextResponse.json({
      pages: [
        ...pages.map((p) => ({
          id: p.id,
          path: p.path,
          title: p.title,
          status: p.status,
          hasUnpublishedChanges: hasUnpublishedChanges(p),
          sections: p.blocks.length,
          updatedAt: p.updatedAt,
          publishedAt: p.publishedAt,
        })),
        ...untouchedBuiltIns.map((p) => ({ id: null, path: p.path, title: p.label, status: "published", builtInDefault: true })),
      ],
    });
  } catch (error) {
    return pageErrorResponse(error);
  }
}

/** Create a custom page: { title, path, blocks?, status?, metaTitle?,
 * metaDescription?, ogImage?, noindex? }. Draft unless status is
 * "published". See GET /api/v1/pages/block-types for block shapes. */
export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, "pages:write");
  if (!auth.ok) return unauthorized();
  try {
    const page = await createPage(await req.json().catch(() => ({})), actorOf(auth));
    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    return pageErrorResponse(error);
  }
}
