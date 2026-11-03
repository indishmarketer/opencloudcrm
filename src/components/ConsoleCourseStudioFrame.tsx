"use client";

import { usePathname } from "next/navigation";
import ConsoleCourseTabs from "@/components/ConsoleCourseTabs";

export default function ConsoleCourseStudioFrame({
  courseId,
  title,
  published,
  children,
}: {
  courseId: string;
  title: string;
  published: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === `/console/courses/${courseId}/page-sections`) return children;

  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${published ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
          {published ? "Published" : "Draft"}
        </span>
      </div>
      <div className="mt-6"><ConsoleCourseTabs courseId={courseId} /></div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
