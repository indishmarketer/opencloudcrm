import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { findToolLogo, uploadDirectoryAsset } from "@/lib/logoFetch";

/** Finds and re-hosts a real logo for tools that have none (tools added in
 * bulk, or whose lookup failed at submission). A slow site can take ~30s
 * to answer, so each request does 6 in parallel to stay under Cloudflare's
 * 100s limit; the console calls again with `next` until done. */
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const after = Number.isInteger(body.after) ? body.after : 0;
  const missing = await pool.query(
    "SELECT id, name, website_url FROM directory_tools WHERE logo_url IS NULL AND id > $1 ORDER BY id LIMIT 6",
    [after]
  );
  const found: string[] = [];
  const notFound: string[] = [];
  await Promise.all(
    missing.rows.map(async (tool) => {
      try {
        const logo = await findToolLogo(tool.website_url);
        if (!logo) {
          notFound.push(tool.name);
          return;
        }
        const url = await uploadDirectoryAsset(logo, "directory/logos");
        await pool.query("UPDATE directory_tools SET logo_url = $1 WHERE id = $2 AND logo_url IS NULL", [url, tool.id]);
        found.push(tool.name);
      } catch {
        notFound.push(tool.name);
      }
    })
  );
  const last = missing.rows[missing.rows.length - 1];
  return NextResponse.json({ found, notFound, next: missing.rows.length === 6 ? last.id : null });
}
