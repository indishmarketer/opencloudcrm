import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { describeDesignSystem, MAX_DESIGN_NOTES, saveDesignNotes } from "@/lib/designSystem";
import { unauthorized } from "@/lib/pagesApi";

/** The site's design system, over the API/MCP surface: palette, fonts,
 * layout measurements, the CSS variables a custom section can build on,
 * the platform constraints that would otherwise fail silently, and the
 * owner's own brand notes. Read this before designing a page rather than
 * inferring a design system from whatever the existing sections look
 * like -- see src/lib/designSystem.ts for why that inference goes wrong. */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "pages:read");
  if (!auth.ok) return unauthorized();
  return NextResponse.json(await describeDesignSystem());
}

/** Sets the owner's brand direction (free text, returned to every later
 * reader as brandNotes). Deployment content, so it lives in the database
 * -- never committed to this repo, which ships no opinion about any one
 * site's brand. */
export async function PUT(req: NextRequest) {
  const auth = await authorizeRequest(req, "pages:write");
  if (!auth.ok) return unauthorized();
  const body = (await req.json().catch(() => null)) as { notes?: unknown } | null;
  if (!body || typeof body.notes !== "string") {
    return NextResponse.json({ error: "notes is required: the brand direction to apply to every page built from now on." }, { status: 400 });
  }
  const notes = await saveDesignNotes(body.notes);
  return NextResponse.json({ brandNotes: notes || null, truncated: body.notes.length > MAX_DESIGN_NOTES });
}
