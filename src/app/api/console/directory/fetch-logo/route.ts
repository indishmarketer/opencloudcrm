import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { findRealLogo, uploadDirectoryAsset } from "@/lib/logoFetch";

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { domain } = await req.json();
  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "A domain is required, e.g. n8n.io" }, { status: 400 });
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const logo = await findRealLogo(cleanDomain);
  if (!logo) {
    return NextResponse.json({ error: "No real logo found for that domain. Upload one manually instead." }, { status: 404 });
  }

  const url = await uploadDirectoryAsset(logo, "directory/logos");
  return NextResponse.json({ url });
}
