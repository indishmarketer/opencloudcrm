import ConsoleBlogCategories from "@/components/ConsoleBlogCategories";
import { getBlogCategories } from "@/lib/blogCategories";

export const dynamic = "force-dynamic";

export default async function BlogCategoriesPage() {
  return <ConsoleBlogCategories initial={await getBlogCategories()} />;
}
