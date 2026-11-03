import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteUnreferencedBlogImages } from "@/lib/blogImageCleanup";
import { getBlogCategories, saveBlogCategories } from "@/lib/blogCategories";

function refresh(slug: string) {
  revalidatePath("/blog", "layout");
  revalidatePath("/blog/category");
  revalidatePath(`/blog/category/${slug}`);
  revalidatePath("/sitemap.xml");
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!/^\d+$/.test(id) || !name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: "Enter a category name and a valid lowercase URL slug." }, { status: 400 });
  const categories = await getBlogCategories();
  const index = categories.findIndex((category) => category.id === Number(id));
  if (index < 0) return NextResponse.json({ error: "Category not found." }, { status: 404 });
  if (categories.some((category) => category.slug === slug && category.id !== Number(id))) return NextResponse.json({ error: "That category URL is already in use." }, { status: 409 });
  const previous = categories[index];
  const updated = {
    ...previous, slug, name,
    description: typeof body.description === "string" ? body.description.trim().slice(0, 500) : "",
    image: typeof body.image === "string" ? body.image.trim() : "",
    image_alt: typeof body.image_alt === "string" ? body.image_alt.trim().slice(0, 300) : "",
  };
  categories[index] = updated;
  await saveBlogCategories(categories);
  if (previous.slug !== slug) await pool.query("UPDATE blog_posts SET category=$2, updated_at=now() WHERE category=$1", [previous.slug, slug]);
  if (previous.image !== updated.image) await deleteUnreferencedBlogImages([previous.image]);
  refresh(previous.slug);
  refresh(slug);
  return NextResponse.json({ category: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  const categories = await getBlogCategories();
  const category = categories.find((item) => item.id === Number(id));
  if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
  const used = await pool.query("SELECT 1 FROM blog_posts WHERE category=$1 LIMIT 1", [category.slug]);
  if (used.rowCount) return NextResponse.json({ error: "Move this category's posts to another category before deleting it." }, { status: 409 });
  await saveBlogCategories(categories.filter((item) => item.id !== category.id).map((item, position) => ({ ...item, position })));
  await deleteUnreferencedBlogImages([category.image]);
  refresh(category.slug);
  return NextResponse.json({ ok: true });
}
