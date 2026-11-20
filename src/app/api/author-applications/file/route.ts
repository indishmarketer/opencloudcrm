import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getAuthorApplicationByToken } from "@/lib/authorApplications";
import { readAuthorDocument } from "@/lib/authorApplicationStorage";

type FileRow = {
  sample_file_key: string | null;
  sample_file_name: string | null;
  sample_file_type: string | null;
  submission_file_key: string | null;
  submission_file_name: string | null;
  submission_file_type: string | null;
};

function disposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const kind = req.nextUrl.searchParams.get("kind") === "submission" ? "submission" : "sample";
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid application." }, { status: 400 });

  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    const application = token ? await getAuthorApplicationByToken(token) : null;
    if (!application || application.id !== id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pool.query<FileRow>(
    `SELECT sample_file_key, sample_file_name, sample_file_type,
            submission_file_key, submission_file_name, submission_file_type
     FROM author_applications WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  const key = kind === "submission" ? row?.submission_file_key : row?.sample_file_key;
  const name = kind === "submission" ? row?.submission_file_name : row?.sample_file_name;
  const contentType = kind === "submission" ? row?.submission_file_type : row?.sample_file_type;
  if (!key || !name) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const bytes = await readAuthorDocument(key);
  if (!bytes) return NextResponse.json({ error: "File not found." }, { status: 404 });

  return new NextResponse(Uint8Array.from(bytes), {
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Disposition": disposition(name),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
