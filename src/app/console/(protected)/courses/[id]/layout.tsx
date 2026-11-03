import { pool } from "@/lib/db";
import { notFound } from "next/navigation";
import ConsoleCourseStudioFrame from "@/components/ConsoleCourseStudioFrame";

export default async function CourseStudioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const result = await pool.query(
    "SELECT id, title, published FROM courses WHERE id = $1",
    [(await params).id]
  );
  if (result.rows.length === 0) return notFound();
  const course = result.rows[0];

  return <ConsoleCourseStudioFrame courseId={String(course.id)} title={course.title} published={course.published}>{children}</ConsoleCourseStudioFrame>;
}
