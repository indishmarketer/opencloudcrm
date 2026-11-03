import ConsoleCourseListTabs from "@/components/ConsoleCourseListTabs";

export default function CourseListLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Course Studio</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Manage your courses, curriculum, students, and payment claims.
      </p>
      <div className="mt-6">
        <ConsoleCourseListTabs />
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
