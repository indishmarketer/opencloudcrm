import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);

// Separate bucket from course-videos/blog-images (src/lib/r2Upload.ts) --
// backups are internal-only, never publicly served, so they don't share a
// public URL or the same env var names. No R2_BACKUP_BUCKET env var is
// required; "db-backups" is the bucket created for this specific purpose.
const BACKUP_BUCKET = process.env.R2_BACKUP_BUCKET || "db-backups";

let cachedClient: S3Client | null = null;
function getS3Client(): S3Client | null {
  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  if (!cachedClient) {
    cachedClient = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  }
  return cachedClient;
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Runs pg_dump against this container's own DATABASE_URL (same DB the app
 * already connects to via src/lib/db.ts), gzips the output, and uploads it
 * to the dedicated db-backups R2 bucket as daily/YYYY-MM-DD.sql.gz. Then
 * applies retention: keep the last 14 daily backups, plus one backup per
 * month for the last 6 months (the earliest available one that month),
 * delete everything else. Throws on any real failure -- a silent backup
 * failure is worse than a loud one, unlike most best-effort helpers in
 * this codebase. */
export async function runDatabaseBackup(): Promise<{ key: string; sizeBytes: number; deleted: string[] }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

  const s3 = getS3Client();
  if (!s3) throw new Error("R2 credentials are not configured.");

  const { stdout } = await execFileAsync("pg_dump", [databaseUrl], {
    maxBuffer: 512 * 1024 * 1024, // this DB is ~12MB uncompressed today; 512MB is a generous ceiling
    encoding: "buffer",
  });
  const compressed = await gzipAsync(stdout);

  const key = `daily/${todayKey()}.sql.gz`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BACKUP_BUCKET,
      Key: key,
      Body: compressed,
      ContentType: "application/gzip",
    })
  );

  const deleted = await applyRetention(s3);
  return { key, sizeBytes: compressed.byteLength, deleted };
}

async function applyRetention(s3: S3Client): Promise<string[]> {
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: BACKUP_BUCKET, Prefix: "daily/" }));
  const objects = (listed.Contents || [])
    .map((o) => o.Key || "")
    .filter((key) => /^daily\/\d{4}-\d{2}-\d{2}\.sql\.gz$/.test(key))
    .map((key) => ({ key, date: key.slice(6, 16) })) // "daily/" is 6 chars
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

  const keep = new Set<string>();

  // Last 14 daily backups, regardless of month.
  for (const o of objects.slice(0, 14)) keep.add(o.key);

  // Earliest backup available in each of the last 6 calendar months --
  // approximates a "monthly" snapshot without needing a separate upload.
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthPrefix = monthDate.toISOString().slice(0, 7); // YYYY-MM
    const inMonth = objects.filter((o) => o.date.startsWith(monthPrefix));
    if (inMonth.length > 0) keep.add(inMonth[inMonth.length - 1].key); // oldest in that month (list is newest-first)
  }

  const toDelete = objects.filter((o) => !keep.has(o.key)).map((o) => o.key);
  for (const key of toDelete) {
    await s3.send(new DeleteObjectCommand({ Bucket: BACKUP_BUCKET, Key: key }));
  }
  return toDelete;
}
