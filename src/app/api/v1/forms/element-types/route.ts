import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import {
  CONTACT_TARGET_LABELS,
  FORM_AUTHORING_NOTES,
  FORM_ELEMENT_PALETTE,
  FORM_ELEMENT_STYLE_KEYS,
  FORM_FIELD_TYPES,
} from "@/lib/formsShape";

/** The complete form-authoring vocabulary, as data.
 *
 * Both MCP transports expose this as `list_form_element_types`. It lives
 * behind an endpoint rather than being hardcoded in each of them because the
 * local stdio server is plain Node and cannot import the TypeScript source
 * the console editor builds its palette from -- so the one place the
 * vocabulary is defined (src/lib/formsShape.ts) stays the only place, and a
 * new element type cannot appear in the editor while an agent still believes
 * it does not exist.
 *
 * Note: this static segment sits beside /api/v1/forms/[id], which also
 * accepts a slug. App Router matches static segments first, so a form whose
 * slug was literally "element-types" would be unreachable by slug through
 * that route (its numeric id still works). */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "forms:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    elementTypes: FORM_ELEMENT_PALETTE,
    fieldTypes: FORM_FIELD_TYPES,
    elementStyleKeys: FORM_ELEMENT_STYLE_KEYS,
    contactTargets: CONTACT_TARGET_LABELS,
    notes: FORM_AUTHORING_NOTES,
  });
}
