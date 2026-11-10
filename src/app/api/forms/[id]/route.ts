import { NextRequest, NextResponse } from "next/server";
import { getFormById } from "@/lib/forms";
import { checkRateLimit } from "@/lib/rateLimit";

/** Public, unauthenticated: a saved form's render-safe definition, for the
 * "savedForm" page-builder mode, the formPopup button action, and the
 * standalone /f/[slug] page.  notifyEmail (the only non-public field) is
 * deliberately left out. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`form-def:${ip}`, 60, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await params;
  const formId = Number(id);
  if (!Number.isInteger(formId)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const form = await getFormById(formId);
  if (!form) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({
    id: form.id,
    heading: form.heading,
    introText: form.introText,
    fields: form.fields,
    submitLabel: form.submitLabel,
    successHeading: form.successHeading,
    successText: form.successText,
    verifyEmail: form.verifyEmail,
    design: form.design,
  });
}
