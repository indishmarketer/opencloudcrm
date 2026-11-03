import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import ConsoleEntitySections from "@/components/ConsoleEntitySections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course sales page | Console" };

/** A standalone optional sales page, edited with the site-wide page builder. */
export default async function CoursePageSections({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) redirect("/console/login");
  const { id } = await params;
  const result = await pool.query<{ id: number; title: string; slug: string }>("SELECT id, title, slug FROM courses WHERE id::text = $1", [id]);
  const course = result.rows[0];
  if (!course) notFound();
  return (
    <ConsoleEntitySections
      kind="course"
      refId={String(course.id)}
      title={course.title}
      backHref={`/console/courses/${course.id}`}
      backLabel="Course settings"
      publicUrl={`/courses/${course.slug}/sales`}
    />
  );
}
