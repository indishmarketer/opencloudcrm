import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { listBlogAuthors, createBlogAuthor, parseSocialLinks } from "@/lib/blogAuthors";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const authors = await listBlogAuthors();
  return NextResponse.json({ authors });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, role, bio, avatar_url, social_links, application_id } = await req.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const author = await createBlogAuthor({
    name: name.trim(),
    role: role || null,
    bio: bio || null,
    avatar_url: avatar_url || null,
    social_links: parseSocialLinks(social_links),
    application_id: Number.isInteger(application_id) ? application_id : null,
  });
  return NextResponse.json({ author });
}
