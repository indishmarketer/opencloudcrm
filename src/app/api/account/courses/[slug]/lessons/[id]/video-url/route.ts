import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getCourseBySlug, getUserEnrollment, tierSatisfies } from "@/lib/courses";

// One client for the process -- avoids a fresh TLS handshake on every
// lesson-video request.
let cachedS3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cachedS3Client;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug, id } = await params;
  const lessonId = Number(id);
  if (!Number.isInteger(lessonId)) return NextResponse.json({ error: "Invalid lesson." }, { status: 400 });

  const course = await getCourseBySlug(slug);
  if (!course) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const enrollment = await getUserEnrollment(session.userId, course.id);
  if (!enrollment) return NextResponse.json({ error: "Not enrolled." }, { status: 403 });

  const lessonResult = await pool.query(
    `SELECT l.*, m.tier AS module_tier FROM course_lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE l.id = $1 AND m.course_id = $2`,
    [lessonId, course.id]
  );
  const lesson = lessonResult.rows[0];
  if (!lesson) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!tierSatisfies(enrollment.tier, lesson.module_tier)) {
    return NextResponse.json({ error: "Upgrade to PRO to access this lesson." }, { status: 403 });
  }
  if (!lesson.video_ref) {
    return NextResponse.json({ error: "Video coming soon.", code: "video_pending" }, { status: 404 });
  }

  if (lesson.video_type === "youtube") {
    return NextResponse.json({ type: "youtube", videoId: lesson.video_ref });
  }

  const s3 = getS3Client();
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.R2_COURSES_BUCKET || "course-videos", Key: lesson.video_ref }),
    { expiresIn: 60 * 60 * 2 }
  );
  return NextResponse.json({ type: "r2", url });
}
