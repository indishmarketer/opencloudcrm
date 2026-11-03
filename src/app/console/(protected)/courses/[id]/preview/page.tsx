import { pool } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function CoursePreviewPage({ params }: { params: Promise<{ id: string  }> }) {
  const result = await pool.query("SELECT slug, published FROM courses WHERE id = $1", [(await params).id]);
  if (result.rows.length === 0) return notFound();
  
  const course = result.rows[0];

  return (
    <div className="bg-paper border border-line rounded-2xl p-8 max-w-2xl mx-auto text-center mt-12">
      <h2 className="font-display text-2xl font-semibold mb-4">Preview Course</h2>
      <p className="text-ink-soft mb-8">
        {course.published 
          ? "This course is currently live. You can view it on the public site." 
          : "This course is a draft. Because you are an admin, you can securely preview it on the real course page before publishing."}
      </p>
      
      <a 
        href={`/courses/${course.slug}`} 
        target="_blank"
        className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 inline-block"
      >
        Open Preview in New Tab
      </a>
      
      <p className="text-xs text-ink-soft mt-6">
        The preview uses the exact same rendering logic as the live site, so you can test pricing, buttons, and curriculum structure securely.
      </p>
    </div>
  );
}
