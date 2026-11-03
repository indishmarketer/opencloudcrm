import { redirect } from "next/navigation";

// Moved under Console > Blog.
export default function ConsoleBlogAuthorsRedirect() {
  redirect("/console/blog/authors");
}
