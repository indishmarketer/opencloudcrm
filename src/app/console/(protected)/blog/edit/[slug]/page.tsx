import { notFound } from "next/navigation";
import ConsoleBlogEditor from "@/components/ConsoleBlogEditor";
import { blogPreviewUrl, getPostBySlug } from "@/lib/blogPosts";
import { listBlogAuthors } from "@/lib/blogAuthors";
import { getBlogCategories } from "@/lib/blogCategories";

export const dynamic = "force-dynamic";

export default async function EditBlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [post, authors, blogCategories] = await Promise.all([getPostBySlug(slug), listBlogAuthors(), getBlogCategories()]);
  if (!post) notFound();

  return (
    <ConsoleBlogEditor
      mode="edit"
      initial={post}
      initialPreviewUrl={blogPreviewUrl(post.slug, post.status)}
      categories={blogCategories.map((c) => ({ slug: c.slug, name: c.name }))}
      authors={authors.filter((a) => a.is_active).map((a) => ({ slug: a.slug, name: a.name }))}
    />
  );
}
