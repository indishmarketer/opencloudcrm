"use client";

import { Fragment, useState, useEffect } from "react";
import Link from "next/link";
import Avatar from "@/components/community/Avatar";
import { timeAgo } from "@/lib/timeAgo";
import ConsoleModal from "@/components/ConsoleModal";
import BrandSelect from "@/components/BrandSelect";

type UserResult = { contactId: number; userId: number | null; name: string | null; email: string };

const STUDENTS_PER_PAGE = 15;

type CourseLight = {
  id: number;
  title: string;
  has_free_tier: boolean;
};

type Student = {
  enrollment_id: number;
  course_id: number;
  course_title: string;
  has_free_tier: boolean;
  user_id: number;
  name: string | null;
  email: string;
  avatar_url: string | null;
  tier: string;
  enrolled_at: string;
  total_lessons: number;
  completed_lessons: number;
  last_activity: string | null;
};

type StudentGroup = {
  user_id: number;
  name: string | null;
  email: string;
  avatar_url: string | null;
  enrollments: Student[];
  last_activity: string | null;
};

/** One row per person, however many courses they have. Enrollments arrive
 * newest first, so groups keep the order of each person's latest enrollment. */
function groupByStudent(list: Student[]): StudentGroup[] {
  const groups = new Map<number, StudentGroup>();
  for (const s of list) {
    let g = groups.get(s.user_id);
    if (!g) {
      g = { user_id: s.user_id, name: s.name, email: s.email, avatar_url: s.avatar_url, enrollments: [], last_activity: null };
      groups.set(s.user_id, g);
    }
    g.enrollments.push(s);
    if (s.last_activity && (!g.last_activity || new Date(s.last_activity) > new Date(g.last_activity))) {
      g.last_activity = s.last_activity;
    }
  }
  return [...groups.values()];
}

function percent(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

export default function ConsoleCourseStudents({ courses, students }: { courses: CourseLight[]; students: Student[] }) {
  const [studentList, setStudentList] = useState(students);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentTierInput, setStudentTierInput] = useState("free");
  const [confirmRevoke, setConfirmRevoke] = useState<Student | null>(null);
  const [granting, setGranting] = useState(false);
  const [grantQuery, setGrantQuery] = useState("");
  const [grantResults, setGrantResults] = useState<UserResult[]>([]);
  const [grantSelected, setGrantSelected] = useState<UserResult | null>(null);
  const [grantCourseId, setGrantCourseId] = useState(String(courses[0]?.id ?? ""));
  const [grantTier, setGrantTier] = useState("pro");
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);
  const [studentPage, setStudentPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const groups = groupByStudent(studentList).filter((g) => {
    const q = search.trim().toLowerCase();
    return !q || `${g.name || ""} ${g.email}`.toLowerCase().includes(q);
  });
  const pageCount = Math.max(1, Math.ceil(groups.length / STUDENTS_PER_PAGE));
  const page = Math.min(studentPage, pageCount - 1);

  function openStudentEdit(s: Student) {
    setEditingStudent(s);
    setStudentTierInput(s.tier);
  }

  const grantCourse = courses.find((c) => String(c.id) === grantCourseId);

  useEffect(() => {
    if (grantSelected || grantQuery.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGrantResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/console/users/search?q=${encodeURIComponent(grantQuery.trim())}`);
      if (res.ok) {
        const body = await res.json();
        if (!cancelled) setGrantResults(body.users);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [grantQuery, grantSelected]);

  function closeGrant() {
    setGranting(false);
    setGrantQuery("");
    setGrantResults([]);
    setGrantSelected(null);
    setGrantError(null);
  }

  async function submitGrant() {
    if (!grantSelected) return;
    setGrantBusy(true);
    setGrantError(null);
    const res = await fetch("/api/console/courses/enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: grantSelected.contactId,
        courseId: Number(grantCourseId),
        tier: grantCourse?.has_free_tier ? grantTier : "pro",
      }),
    });
    const body = await res.json();
    setGrantBusy(false);
    if (!res.ok) {
      setGrantError(body.error || "Could not grant access.");
      return;
    }
    closeGrant();
    window.location.reload();
  }

  async function saveStudentTier() {
    if (!editingStudent) return;
    await fetch(`/api/console/courses/enrollments/${editingStudent.enrollment_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: studentTierInput }),
    });
    setStudentList((list) =>
      list.map((s) =>
        s.enrollment_id === editingStudent.enrollment_id ? { ...s, tier: studentTierInput } : s
      )
    );
    setEditingStudent(null);
  }

  async function revokeStudentAccess() {
    if (!confirmRevoke) return;
    await fetch(`/api/console/courses/enrollments/${confirmRevoke.enrollment_id}`, { method: "DELETE" });
    setStudentList((list) => list.filter((s) => s.enrollment_id !== confirmRevoke.enrollment_id));
    setConfirmRevoke(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-2xl font-semibold">Students</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setStudentPage(0);
            }}
            placeholder="Search name or email…"
            className="w-56 rounded-full border border-line bg-paper px-4 py-1.5 text-xs outline-none focus:border-ink"
          />
          <button
            onClick={() => setGranting(true)}
            className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80"
          >
            Grant access
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Courses</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {groups.slice(page * STUDENTS_PER_PAGE, (page + 1) * STUDENTS_PER_PAGE).map((g) => {
              const open = expanded === g.user_id;
              return (
                <Fragment key={g.user_id}>
                  <tr
                    onClick={() => setExpanded(open ? null : g.user_id)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-paper-soft"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar url={g.avatar_url} name={g.name || g.email} size={28} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{g.name || "n/a"}</p>
                          <p className="truncate text-xs text-ink-soft">{g.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {g.enrollments.map((s) => (
                          <span
                            key={s.enrollment_id}
                            title={s.course_title}
                            className={`max-w-[12rem] truncate rounded-full px-2.5 py-1 text-xs font-medium ${
                              s.tier === "pro" ? "bg-ink text-paper" : "bg-paper-soft text-ink-soft"
                            }`}
                          >
                            {s.course_title}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-soft">
                      {g.last_activity ? timeAgo(g.last_activity) : "Not started"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-medium text-ink-soft">
                      {open ? "Hide" : g.enrollments.length === 1 ? "View access" : `View ${g.enrollments.length} courses`}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-line bg-paper-soft last:border-0">
                      <td colSpan={4} className="px-4 py-4">
                        <div className="space-y-2">
                          {g.enrollments.map((s) => {
                            const pct = percent(s.completed_lessons, s.total_lessons);
                            return (
                              <div
                                key={s.enrollment_id}
                                className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-paper px-4 py-3"
                              >
                                <div className="min-w-[12rem] flex-1">
                                  <Link
                                    href={`/console/courses/${s.course_id}/students`}
                                    className="font-medium hover:underline"
                                  >
                                    {s.course_title}
                                  </Link>
                                  <p className="text-xs text-ink-soft">
                                    <span className={s.tier === "pro" ? "font-semibold text-ink" : ""}>
                                      {s.tier.toUpperCase()}
                                    </span>
                                    {" · enrolled "}
                                    {timeAgo(s.enrolled_at)}
                                    {s.last_activity ? ` · last lesson ${timeAgo(s.last_activity)}` : ""}
                                  </p>
                                </div>
                                <div className="flex w-48 items-center gap-2">
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-soft">
                                    <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="shrink-0 text-xs text-ink-soft">
                                    {s.completed_lessons}/{s.total_lessons}
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => openStudentEdit(s)}
                                    className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-ink"
                                  >
                                    Edit access
                                  </button>
                                  <button
                                    onClick={() => setConfirmRevoke(s)}
                                    className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:border-red-500"
                                  >
                                    Revoke
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {groups.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-ink-soft" colSpan={4}>
                  {studentList.length === 0 ? "No students yet." : "No students match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Click a student to see every course they can access, their progress in each, and to change access.
      </p>
      {groups.length > STUDENTS_PER_PAGE && (
        <div className="mt-3 flex items-center justify-between text-sm text-ink-soft">
          <button
            onClick={() => setStudentPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded-full border border-line px-4 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {pageCount}
          </span>
          <button
            onClick={() => setStudentPage(Math.min(pageCount - 1, page + 1))}
            disabled={page >= pageCount - 1}
            className="rounded-full border border-line px-4 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {editingStudent && (
        <ConsoleModal title={`Edit access: ${editingStudent.email}`} onClose={() => setEditingStudent(null)}>
          <p className="text-sm text-ink-soft">{editingStudent.course_title}</p>
          <div className="mt-4 flex gap-2">
            {(editingStudent.has_free_tier ? (["free", "pro"] as const) : (["pro"] as const)).map((t) => (
              <button
                key={t}
                onClick={() => setStudentTierInput(t)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  studentTierInput === t ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                }`}
              >
                {t === "pro" ? "PRO (full access)" : "Free tier only"}
              </button>
            ))}
          </div>
          {!editingStudent.has_free_tier && (
            <p className="mt-2 text-xs text-ink-soft">
              This course has no free tier, so PRO is the only access level.
            </p>
          )}
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => setEditingStudent(null)}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
            >
              Cancel
            </button>
            <button
              onClick={saveStudentTier}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
            >
              Save
            </button>
          </div>
        </ConsoleModal>
      )}

      {granting && (
        <ConsoleModal title="Grant course access" onClose={closeGrant}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-ink-soft">Student</label>
              {grantSelected ? (
                <div className="mt-1 flex items-center justify-between rounded-lg border border-line bg-paper-soft px-4 py-2.5 text-sm">
                  <span>
                    {grantSelected.name || "n/a"} · {grantSelected.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setGrantSelected(null);
                      setGrantQuery("");
                    }}
                    className="text-xs font-medium text-ink-soft underline hover:text-ink"
                  >
                    Change
                  </button>
                </div>
              ) : null}
              {grantSelected && !grantSelected.userId && (
                <p className="mt-1 text-xs text-ink-soft">No account yet. Granting makes one and emails them a sign-in link to the course.</p>
              )}
              {grantSelected ? null : (
                <>
                  <input
                    value={grantQuery}
                    onChange={(e) => setGrantQuery(e.target.value)}
                    placeholder="Search by name or email…"
                    className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
                  />
                  {grantResults.length > 0 && (
                    <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-line bg-paper">
                      {grantResults.map((u) => (
                        <button
                          key={u.contactId}
                          type="button"
                          onClick={() => {
                            setGrantSelected(u);
                            setGrantResults([]);
                          }}
                          className="block w-full px-4 py-2.5 text-left text-sm hover:bg-paper-soft"
                        >
                          {u.name || "n/a"} · {u.email}
                          {!u.userId && <span className="ml-2 text-xs text-ink-soft">no account yet</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {grantQuery.trim().length >= 2 && grantResults.length === 0 && (
                    <p className="mt-1 text-xs text-ink-soft">No matching contact found. Add them in Contacts first.</p>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Course</label>
              <BrandSelect
                value={grantCourseId}
                onChange={setGrantCourseId}
                options={courses.map((c) => ({ value: String(c.id), label: c.title }))}
                className="mt-1"
              />
            </div>
            {grantCourse?.has_free_tier ? (
              <div>
                <label className="text-xs font-medium text-ink-soft">Access level</label>
                <div className="mt-1 flex gap-2">
                  {(["free", "pro"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setGrantTier(t)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        grantTier === t ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                      }`}
                    >
                      {t === "pro" ? "PRO (full access)" : "Free tier only"}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-soft">This course has no free tier, so access level will be PRO.</p>
            )}
            {grantError && <p className="text-xs text-red-600">{grantError}</p>}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={closeGrant}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
            >
              Cancel
            </button>
            <button
              onClick={submitGrant}
              disabled={grantBusy || !grantSelected}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              Grant access
            </button>
          </div>
        </ConsoleModal>
      )}

      {confirmRevoke && (
        <ConsoleModal title="Revoke access?" onClose={() => setConfirmRevoke(null)}>
          <p className="text-sm text-ink-soft">
            This removes {confirmRevoke.email}&apos;s access to {confirmRevoke.course_title} entirely
            (including their progress). They&apos;d need to enroll again to get free access back.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => setConfirmRevoke(null)}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
            >
              Cancel
            </button>
            <button
              onClick={revokeStudentAccess}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
            >
              Revoke
            </button>
          </div>
        </ConsoleModal>
      )}
    </div>
  );
}
