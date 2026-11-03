import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { isBanned } from "@/lib/community";
import { listCourseComments, canCommentOnLesson } from "@/lib/courses";
import { createCourseComment } from "@/lib/courseComments";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
  const lessonId = Number(req.nextUrl.searchParams.get("lessonId"));
  if (!Number.isInteger(lessonId)) return NextResponse.json({ error: "Missing lesson." }, { status: 400 });
  if (!(await canCommentOnLesson(session.userId, lessonId))) {
    return NextResponse.json({ error: "You don't have access to this lesson." }, { status: 403 });
  }
  const comments = await listCourseComments(lessonId);
  return NextResponse.json(
    { comments },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isBanned(session.userId)) {
    return NextResponse.json({ error: "You've been restricted from posting in the community." }, { status: 403 });
  }

  if (!(await checkRateLimit(`course-comment:${session.userId}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many comments. Try again later." }, { status: 429 });
  }

  const { lessonId, body, parentCommentId } = await req.json();
  const lessonIdNum = Number(lessonId);
  if (!Number.isInteger(lessonIdNum)) {
    return NextResponse.json({ error: "Invalid lesson." }, { status: 400 });
  }
  if (!body || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "Comment can't be empty." }, { status: 400 });
  }

  if (!(await canCommentOnLesson(session.userId, lessonIdNum))) {
    return NextResponse.json({ error: "You don't have access to this lesson." }, { status: 403 });
  }

  let parentId: number | null = null;
  if (parentCommentId !== undefined && parentCommentId !== null) {
    parentId = Number(parentCommentId);
    if (!Number.isInteger(parentId)) {
      return NextResponse.json({ error: "Invalid parent comment." }, { status: 400 });
    }
  }

  const created = await createCourseComment({
    userId: session.userId,
    lessonId: lessonIdNum,
    body: String(body),
    parentCommentId: parentId,
  });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });

  return NextResponse.json({ ok: true, id: created.id });
}
