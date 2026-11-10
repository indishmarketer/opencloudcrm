import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { actorOf, pageErrorResponse, parseId, unauthorized } from "@/lib/pagesApi";
import { getPageById, updatePage } from "@/lib/sitePages";
import { getFormById, getFormBySlug } from "@/lib/forms";
import type { PageBlock } from "@/lib/pageBlocks";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await authorizeRequest(req, "pages:write");
  if (!auth.ok) return unauthorized();

  const pageId = parseId((await params).id);
  if (!pageId) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  const page = await getPageById(pageId);
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) || {};
  const rawFormId = body.formId;
  if (!rawFormId && rawFormId !== 0) {
    return NextResponse.json({ error: "formId is required." }, { status: 400 });
  }

  const numFormId = Number(rawFormId);
  const form = Number.isInteger(numFormId) && numFormId > 0
    ? await getFormById(numFormId)
    : await getFormBySlug(String(rawFormId));
  if (!form) return NextResponse.json({ error: "Form not found." }, { status: 404 });

  const newBlock: PageBlock = {
    id: `blk_${Math.random().toString(36).slice(2, 10)}`,
    type: "form",
    props: {
      mode: "saved",
      savedFormId: String(form.id),
    },
  };

  const blocks = [...page.blocks];
  const position = body.position;
  if (position === "top") {
    blocks.unshift(newBlock);
  } else if (typeof position === "number" && Number.isInteger(position)) {
    const idx = Math.max(0, Math.min(position, blocks.length));
    blocks.splice(idx, 0, newBlock);
  } else {
    blocks.push(newBlock);
  }

  try {
    const updated = await updatePage(pageId, { blocks }, actorOf(auth));
    return NextResponse.json({ ok: true, page: updated, placedBlockId: newBlock.id });
  } catch (error) {
    return pageErrorResponse(error);
  }
}
