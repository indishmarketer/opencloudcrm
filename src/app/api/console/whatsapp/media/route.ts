import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { HEADER_MEDIA_TYPES, uploadTemplateMediaSample } from "@/lib/whatsappTemplates";
import { uploadWhatsAppMediaToR2 } from "@/lib/r2Upload";

const MAX_BYTES = 16 * 1024 * 1024;

const R2_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

/** Takes the sample image/video/PDF for a media-header template and hands
 * back Meta's file handle, which the create-template call then references. */
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const allowed = HEADER_MEDIA_TYPES[file.type];
  if (!allowed) return NextResponse.json({ error: "Use a JPEG, PNG, MP4 or PDF." }, { status: 400 });
  if (file.size > Math.min(allowed.maxBytes, MAX_BYTES)) {
    return NextResponse.json(
      { error: `That file is too big. Limit is ${Math.round(allowed.maxBytes / (1024 * 1024))}MB for this type.` },
      { status: 413 },
    );
  }

  try {
    // Two destinations, for two different jobs: Meta gets a copy to review
    // the template against, and R2 keeps the file at a public URL because
    // every real send hands WhatsApp a URL to fetch the media from.
    const handle = await uploadTemplateMediaSample({
      bytes: await file.arrayBuffer(),
      type: file.type,
      name: file.name || "sample",
    });
    const stored = await uploadWhatsAppMediaToR2(file, R2_EXTENSIONS);
    if ("error" in stored) return NextResponse.json({ error: stored.error }, { status: 409 });

    return NextResponse.json({ ok: true, handle, format: allowed.format, url: stored.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 409 });
  }
}
