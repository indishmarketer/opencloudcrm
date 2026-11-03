import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { getBlogCategories, saveBlogCategories, blogCategorySlug } from "@/lib/blogCategories";

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ categories: await getBlogCategories() });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const slug = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim().toLowerCase() : blogCategorySlug(name);
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: "Enter a category name and a valid lowercase URL slug." }, { status: 400 });
  const categories = await getBlogCategories();
  if (categories.some((category) => category.slug === slug)) return NextResponse.json({ error: "That category URL is already in use." }, { status: 409 });
  const category = {
    id: Date.now(), slug, name,
    description: typeof body.description === "string" ? body.description.trim().slice(0, 500) : "",
    image: typeof body.image === "string" ? body.image.trim() : "",
    image_alt: typeof body.image_alt === "string" ? body.image_alt.trim().slice(0, 300) : "",
    position: categories.length,
  };
  categories.push(category);
  await saveBlogCategories(categories);
  revalidatePath("/blog", "layout");
  revalidatePath("/blog/category");
  revalidatePath("/sitemap.xml");
  return NextResponse.json({ category }, { status: 201 });
}
