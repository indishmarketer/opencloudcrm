import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MAX_COURSE_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;
export const ALLOWED_COURSE_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

let cachedClient: S3Client | null = null;

function storageConfig() {
  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_COURSES_BUCKET || "course-videos";
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  if (!cachedClient) {
    cachedClient = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  }
  return { client: cachedClient, bucket };
}

export async function createCourseVideoUpload(input: {
  courseId: number;
  filename: string;
  contentType: string;
  size: number;
}): Promise<{ key: string; uploadUrl: string } | { error: string }> {
  if (!ALLOWED_COURSE_VIDEO_TYPES.has(input.contentType)) return { error: "Unsupported video format." };
  if (!Number.isInteger(input.size) || input.size < 1 || input.size > MAX_COURSE_VIDEO_SIZE) {
    return { error: "Video must be larger than 0 bytes and no more than 2GB." };
  }
  const config = storageConfig();
  if (!config) return { error: "Course video storage is not configured." };

  const safeFilename = input.filename.replace(/[^a-zA-Z0-9.-]/g, "_").slice(-180) || "video";
  const key = `courses/${input.courseId}/videos/${randomUUID()}_${safeFilename}`;
  const uploadUrl = await getSignedUrl(
    config.client,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: input.contentType }),
    { expiresIn: 15 * 60 },
  );
  return { key, uploadUrl };
}

export type CourseVideoItem = { key: string; courseId: number | null; size: number; lastModified: string | null };

/** For the console Media Library's "Course videos" tab -- this bucket is
 * never public (every lesson video is served through a short-lived signed
 * URL, gated by enrollment, see the account video-url route), so this just
 * lists what's stored, it doesn't hand out a reusable public URL the way
 * listR2Objects does for the main bucket. */
export async function listCourseVideoObjects(opts: {
  courseId?: number;
  continuationToken?: string;
  maxKeys?: number;
}): Promise<{ items: CourseVideoItem[]; nextToken: string | null } | { error: string }> {
  const config = storageConfig();
  if (!config) return { error: "Course video storage is not configured." };

  const result = await config.client.send(new ListObjectsV2Command({
    Bucket: config.bucket,
    Prefix: opts.courseId ? `courses/${opts.courseId}/videos/` : undefined,
    ContinuationToken: opts.continuationToken || undefined,
    MaxKeys: opts.maxKeys || 60,
  }));

  const items = (result.Contents || [])
    .filter((obj) => obj.Key)
    .map((obj) => {
      const match = obj.Key!.match(/^courses\/(\d+)\//);
      return {
        key: obj.Key!,
        courseId: match ? Number(match[1]) : null,
        size: obj.Size || 0,
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
      };
    })
    .sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""));

  return { items, nextToken: result.IsTruncated ? result.NextContinuationToken || null : null };
}

/** A short-lived admin preview link for a course video -- not the same URL
 * shape a student gets (that one's checked against their enrollment first
 * in the account video-url route); this is purely for Console admins to
 * confirm a file plays before trusting it's the right one. */
export async function getCourseVideoPreviewUrl(key: string): Promise<{ url: string } | { error: string }> {
  const config = storageConfig();
  if (!config) return { error: "Course video storage is not configured." };
  const url = await getSignedUrl(
    config.client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: 10 * 60 },
  );
  return { url };
}

export async function deleteCourseVideos(keys: string[]): Promise<void> {
  const config = storageConfig();
  if (!config) return;
  await Promise.allSettled(
    Array.from(new Set(keys.filter(Boolean))).map((key) =>
      config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })),
    ),
  );
}
