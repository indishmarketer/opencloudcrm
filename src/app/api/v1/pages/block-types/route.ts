import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { describeBlockTypes, MERGE_TAGS } from "@/lib/pageBlocks";
import { unauthorized } from "@/lib/pagesApi";

/** The section library: every block type, its fields, and an example. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "pages:read");
  if (!auth.ok) return unauthorized();
  return NextResponse.json({
    blockTypes: describeBlockTypes(),
    mergeTags: MERGE_TAGS,
    // Leads with the point that is easy to miss: this list is a library of
    // conveniences, not the only way to build a page, and not this site's
    // design system. Composing the stock sections reproduces the existing
    // pages; the "custom" block is how a new design gets made.
    designingFromScratch:
      "This list is a convenience library, not the site's design system and not a limit on what a page can look like. Composing hero + cards + faq will produce something that looks like every other page here, because those are the same sections the other pages use. For a bespoke design, use the \"custom\" block -- your own HTML plus a real stylesheet, scoped to that section, optionally full-bleed -- one per section of the design you have in mind, and reach for a stock block only where one is genuinely wired to data you cannot hand-write (a contact form, the live blog feed, the newsletter signup). Call /api/v1/site/design (get_design_system) first for the palette, fonts, CSS variables and the constraints that otherwise fail silently -- notably that Tailwind utility classes do not work in hand-written HTML.",
    notes: [
      "A page's blocks are an ordered array of { type, props }. Props you leave out get the type's defaults.",
      "Text fields may contain merge tags such as {{site_name}}; they are filled in when the page is shown.",
      "Links are site paths (/contact) or full https:// URLs. Images are https:// URLs.",
      "Every field reports its maxLength. Values longer than that are truncated on save rather than rejected, so read the page back with get_page to confirm what was stored.",
      "Saving never changes what visitors see until the page is published.",
    ],
  });
}
