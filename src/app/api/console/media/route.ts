import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { listR2Objects, deleteFromR2, uploadMediaLibraryImage, renameR2Object } from "@/lib/r2Upload";

export async function GET(req: NextRequest) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefix = req.nextUrl.searchParams.get("prefix") || undefined;
  const continuationToken = req.nextUrl.searchParams.get("continuationToken") || undefined;
  const recursive = req.nextUrl.searchParams.get("recursive") === "1";
  const result = await listR2Objects({ prefix, continuationToken, recursive });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json(result);
}

/** Upload a new file directly into the Media Library (as opposed to the
 * blog/course/etc. upload routes, which store the URL on a DB row --
 * these have no DB row, the bucket is the only record). */
export async function POST(req: NextRequest) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });

  const prefix = String(form?.get("prefix") || "uploads");
  const alt = String(form?.get("alt") || "");
  const title = String(form?.get("title") || "");

  const result = await uploadMediaLibraryImage(file, prefix, { alt, title });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}

/** Rename a file and/or update its alt text/title. Renaming is a copy +
 * delete under the hood (R2/S3 has no atomic rename) -- see
 * renameR2Object in r2Upload.ts. */
export async function PATCH(req: NextRequest) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { key?: string; newKey?: string; alt?: string; title?: string };
  if (!body.key || typeof body.key !== "string" || body.key.includes("..")) {
    return NextResponse.json({ error: "Invalid file key." }, { status: 400 });
  }
  const hasMeta = body.alt !== undefined || body.title !== undefined;
  const result = await renameR2Object(
    body.key,
    body.newKey || body.key,
    hasMeta ? { alt: body.alt, title: body.title } : undefined
  );
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = req.nextUrl.searchParams.get("key");
  if (!key || key.includes("..")) return NextResponse.json({ error: "Invalid file key." }, { status: 400 });

  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) return NextResponse.json({ error: "Image storage is not configured." }, { status: 503 });

  await deleteFromR2(`${publicUrl}/${key}`);
  return NextResponse.json({ ok: true });
}
