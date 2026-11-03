import ConsoleBlogEditor from "@/components/ConsoleBlogEditor";
import { listBlogAuthors } from "@/lib/blogAuthors";
import { getBlogCategories } from "@/lib/blogCategories";

export default async function NewBlogPostPage() {
  const [authors, blogCategories] = await Promise.all([listBlogAuthors(), getBlogCategories()]);

  return (
    <ConsoleBlogEditor
      mode="create"
      categories={blogCategories.map((c) => ({ slug: c.slug, name: c.name }))}
      authors={authors.filter((a) => a.is_active).map((a) => ({ slug: a.slug, name: a.name }))}
    />
  );
}
