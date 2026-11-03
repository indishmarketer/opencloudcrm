import { redirect } from "next/navigation";

// Moved under Console > Blog. Kept so older notification emails still land.
export default function ConsoleAuthorsRedirect() {
  redirect("/console/blog/applications");
}
