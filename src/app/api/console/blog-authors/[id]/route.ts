import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { deleteFromR2 } from "@/lib/r2Upload";
import { getBlogAuthorById, updateBlogAuthor, deleteBlogAuthor, parseSocialLinks } from "@/lib/blogAuthors";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  const existing = await getBlogAuthorById(id);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { name, role, bio, avatar_url, social_links, is_active } = await req.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const author = await updateBlogAuthor(id, {
    name: name.trim(),
    role: role || null,
    bio: bio || null,
    avatar_url: avatar_url || null,
    social_links: parseSocialLinks(social_links),
    is_active: is_active !== false,
  });
  if (!author) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (existing.avatar_url && existing.avatar_url !== author.avatar_url) {
    await deleteFromR2(existing.avatar_url);
  }

  return NextResponse.json({ author });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  const existing = await getBlogAuthorById(id);
  await deleteBlogAuthor(id);
  if (existing?.avatar_url) await deleteFromR2(existing.avatar_url);
  return NextResponse.json({ ok: true });
}
