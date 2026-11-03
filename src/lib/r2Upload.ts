import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { fetchSafeRemoteImage } from "@/lib/safeRemoteImage";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, verifyImageBytes } from "@/lib/imagePolicy";

export { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } from "@/lib/imagePolicy";

// One client for the process, not one per upload -- avoids re-doing TLS
// negotiation on every request.
let cachedClient: S3Client | null = null;
function getS3Client(endpoint: string, accessKeyId: string, secretAccessKey: string): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  }
  return cachedClient;
}

function ownedPublicObjectKey(candidate: string, publicUrl: string): string | null {
  try {
    const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
    const url = new URL(candidate);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
    const key = decodeURIComponent(url.pathname.slice(base.pathname.length));
    return key && !key.includes("\0") ? key : null;
  } catch {
    return null;
  }
}

export function isOwnedR2Url(candidate: string): boolean {
  const publicUrl = process.env.R2_PUBLIC_URL;
  return Boolean(publicUrl && ownedPublicObjectKey(candidate, publicUrl));
}

/** Every uploaded image on this site (avatars, post images, anything
 * else) goes through this one helper so it's always Cloudflare R2, never
 * the app's own filesystem or database. */
export async function uploadImageToR2(file: File, keyPrefix: string): Promise<{ url: string } | { error: string }> {
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) return { error: "Only PNG, JPEG, GIF, or WEBP images are allowed." };
  if (file.size > MAX_IMAGE_SIZE) return { error: "Image must be under 5MB." };

  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return { error: "Image storage is not configured." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!(await verifyImageBytes(bytes, file.type))) {
    return { error: "That file isn't a valid image of the type it claims to be." };
  }

  const s3 = getS3Client(endpoint, accessKeyId, secretAccessKey);
  const key = `${keyPrefix}/${randomUUID()}.${ext}`;

  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: file.type }));

  return { url: `${publicUrl}/${key}` };
}

/** WhatsApp template header media (image, video or PDF). Kept separate from
 * uploadImageToR2 because WhatsApp accepts MP4 and PDF, which the image
 * policy rightly rejects, and because the public URL matters here: every
 * send of a media template hands WhatsApp a URL to fetch the file from, so
 * it has to stay reachable for as long as the template is in use. */
export async function uploadWhatsAppMediaToR2(
  file: File,
  extensions: Record<string, string>,
): Promise<{ url: string } | { error: string }> {
  const ext = extensions[file.type];
  if (!ext) return { error: "Unsupported file type." };

  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return { error: "Media storage is not configured." };
  }

  const s3 = getS3Client(endpoint, accessKeyId, secretAccessKey);
  const key = `whatsapp/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: file.type }));
  return { url: `${publicUrl}/${key}` };
}

/** Same as uploadImageToR2, but always re-encodes the image as WebP first
 * (via sharp) regardless of the uploaded format, and caps the longest edge
 * at 1600px -- used by editors where the admin is dropping in arbitrary
 * screenshots/photos and shouldn't have to think about format or size. */
export async function uploadWebpImageToR2(file: File, keyPrefix: string): Promise<{ url: string } | { error: string }> {
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) return { error: "Only PNG, JPEG, GIF, or WEBP images are allowed." };
  if (file.size > MAX_IMAGE_SIZE) return { error: "Image must be under 5MB." };

  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return { error: "Image storage is not configured." };
  }

  let webpBytes: Buffer;
  try {
    const inputBytes = Buffer.from(await file.arrayBuffer());
    webpBytes = await sharp(inputBytes)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { error: "Could not process that image." };
  }

  const s3 = getS3Client(endpoint, accessKeyId, secretAccessKey);
  const key = `${keyPrefix}/${randomUUID()}.webp`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: webpBytes, ContentType: "image/webp" }));

  return { url: `${publicUrl}/${key}` };
}

/** Downloads an arbitrary external image URL and re-hosts it on R2, so
 * the site never links straight to a third-party domain (same reasoning
 * as findRealLogo/uploadDirectoryAsset in src/lib/logoFetch.ts, but for
 * any image URL, not just favicons). Returns null on any failure (not
 * reachable, not an image, too large) rather than throwing, since a bad
 * external URL shouldn't fail the whole submission it's part of. */
export async function rehostImageFromUrl(url: string, keyPrefix: string): Promise<string | null> {
  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null;

  // Already ours -- nothing to do.
  if (ownedPublicObjectKey(url, publicUrl)) return url;

  try {
    const { bytes: buf, contentType } = await fetchSafeRemoteImage(url);
    const ext = ALLOWED_IMAGE_TYPES[contentType];
    if (!ext) return null;
    if (!(await verifyImageBytes(buf, contentType))) return null;

    const s3 = getS3Client(endpoint, accessKeyId, secretAccessKey);
    const key = `${keyPrefix}/${randomUUID()}.${ext}`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: contentType }));
    return `${publicUrl}/${key}`;
  } catch {
    return null;
  }
}

const MAX_GUIDE_FILE_SIZE = 20 * 1024 * 1024;

/** The downloadable file behind a free-guide lead magnet (console upload).
 * PDF only, and checked by magic bytes rather than trusting the browser's
 * reported Content-Type -- same reasoning as verifyImageBytes for images,
 * just without sharp (it doesn't parse PDFs): a real PDF always starts
 * with the literal bytes "%PDF-". */
export async function uploadGuideFileToR2(file: File, keyPrefix: string): Promise<{ url: string } | { error: string }> {
  if (file.type !== "application/pdf") return { error: "Only PDF files are allowed." };
  if (file.size > MAX_GUIDE_FILE_SIZE) return { error: "File must be under 20MB." };

  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return { error: "File storage is not configured." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { error: "That file isn't a valid PDF." };
  }

  const s3 = getS3Client(endpoint, accessKeyId, secretAccessKey);
  const key = `${keyPrefix}/${randomUUID()}.pdf`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: "application/pdf" }));

  return { url: `${publicUrl}/${key}` };
}

type R2Config = { s3: S3Client; bucket: string; publicUrl: string };

function r2Config(): R2Config | null {
  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null;
  return { s3: getS3Client(endpoint, accessKeyId, secretAccessKey), bucket, publicUrl };
}

// S3/R2 object metadata values must be ASCII -- encode so an author's
// accented or non-Latin alt text round-trips instead of silently breaking
// the upload.
function encodeMeta(value: string): string {
  return encodeURIComponent(value.slice(0, 500));
}
function decodeMeta(value: string | undefined): string {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

export type R2MediaItem = { key: string; url: string; size: number; lastModified: string | null };

/** Uploads to the Media Library specifically: always WebP, always carries
 * alt/title as R2 object metadata (there's no DB row for a Media Library
 * upload -- the bucket itself is the source of truth, see listR2Objects). */
export async function uploadMediaLibraryImage(
  file: File,
  prefix: string,
  meta: { alt?: string; title?: string }
): Promise<{ url: string; key: string } | { error: string }> {
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) return { error: "Only PNG, JPEG, GIF, or WEBP images are allowed." };
  if (file.size > MAX_IMAGE_SIZE) return { error: "Image must be under 5MB." };
  const config = r2Config();
  if (!config) return { error: "Image storage is not configured." };

  let webpBytes: Buffer;
  try {
    const inputBytes = Buffer.from(await file.arrayBuffer());
    if (!(await verifyImageBytes(inputBytes, file.type))) return { error: "That file isn't a valid image of the type it claims to be." };
    webpBytes = await sharp(inputBytes).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch {
    return { error: "Could not process that image." };
  }

  const safePrefix = prefix.replace(/[^a-z0-9/_-]/gi, "-").replace(/^\/+|\/+$/g, "") || "uploads";
  const key = `${safePrefix}/${randomUUID()}.webp`;
  await config.s3.send(new PutObjectCommand({
    Bucket: config.bucket, Key: key, Body: webpBytes, ContentType: "image/webp",
    Metadata: { alt: encodeMeta(meta.alt || ""), title: encodeMeta(meta.title || "") },
  }));
  return { url: `${config.publicUrl}/${key}`, key };
}

/** A prefix only "exists" in R2 once something is stored under it -- this
 * is that something, so creating a folder from the console is a real,
 * immediate, visible action instead of a no-op until someone uploads into
 * it by coincidence. */
export async function createR2Folder(prefix: string): Promise<{ ok: true } | { error: string }> {
  const config = r2Config();
  if (!config) return { error: "Image storage is not configured." };
  const safePrefix = prefix.replace(/[^a-z0-9/_-]/gi, "-").replace(/^\/+|\/+$/g, "");
  if (!safePrefix) return { error: "Enter a folder name." };
  await config.s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: `${safePrefix}/.keep`, Body: "", ContentType: "text/plain" }));
  return { ok: true };
}

export async function getR2ObjectMeta(key: string): Promise<{ alt: string; title: string } | { error: string }> {
  const config = r2Config();
  if (!config) return { error: "Image storage is not configured." };
  try {
    const result = await config.s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return { alt: decodeMeta(result.Metadata?.alt), title: decodeMeta(result.Metadata?.title) };
  } catch {
    return { error: "Could not read that file." };
  }
}

/** Renames by copying to the new key and deleting the old one -- R2/S3 has
 * no atomic rename. Also used to update alt/title on an unchanged key
 * (newKey === key), since CopyObject with MetadataDirective REPLACE is
 * the only way to change an existing object's metadata in place. */
export async function renameR2Object(
  oldKey: string,
  newKey: string,
  meta?: { alt?: string; title?: string }
): Promise<{ url: string; key: string } | { error: string }> {
  const config = r2Config();
  if (!config) return { error: "Image storage is not configured." };
  const safeNewKey = newKey.replace(/[^a-z0-9/_.-]/gi, "-").replace(/^\/+/, "");
  if (!safeNewKey) return { error: "Enter a valid file name." };

  try {
    const current = meta ? null : await config.s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: oldKey }));
    await config.s3.send(new CopyObjectCommand({
      Bucket: config.bucket,
      CopySource: `/${config.bucket}/${oldKey.split("/").map(encodeURIComponent).join("/")}`,
      Key: safeNewKey,
      MetadataDirective: "REPLACE",
      Metadata: meta
        ? { alt: encodeMeta(meta.alt || ""), title: encodeMeta(meta.title || "") }
        : { alt: current?.Metadata?.alt || "", title: current?.Metadata?.title || "" },
      ContentType: meta ? undefined : current?.ContentType,
    }));
    if (safeNewKey !== oldKey) {
      await config.s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: oldKey }));
    }
    return { url: `${config.publicUrl}/${safeNewKey}`, key: safeNewKey };
  } catch {
    return { error: "Could not rename that file." };
  }
}

/** Lists what's actually in the R2 bucket -- the Media Library reads the
 * bucket directly rather than tracking a separate DB table of uploads, so
 * it's always accurate and every existing upload path (blog images,
 * avatars, directory logos, etc.) shows up with zero extra wiring. */
/** `prefix` is the folder being browsed (e.g. "blog-images/", "" for the
 * root) -- Delimiter: "/" makes R2 group anything deeper into
 * CommonPrefixes instead of flattening the whole bucket into one list, so
 * this returns one level of real folder navigation, not a recursive dump. */
export async function listR2Objects(opts: {
  prefix?: string;
  continuationToken?: string;
  maxKeys?: number;
  /** Omits Delimiter, so every object anywhere under the prefix comes
   * back flattened (no CommonPrefixes) instead of one folder level at a
   * time -- the Media Library's per-folder quick-access tabs use this so
   * clicking "blog-images" shows every image under it in one view,
   * without clicking into each subfolder by hand. */
  recursive?: boolean;
}): Promise<{ items: R2MediaItem[]; folders: string[]; nextToken: string | null } | { error: string }> {
  const config = r2Config();
  if (!config) return { error: "Image storage is not configured." };

  const result = await config.s3.send(new ListObjectsV2Command({
    Bucket: config.bucket,
    Prefix: opts.prefix || undefined,
    Delimiter: opts.recursive ? undefined : "/",
    ContinuationToken: opts.continuationToken || undefined,
    MaxKeys: opts.maxKeys || 60,
  }));

  const items = (result.Contents || [])
    .filter((obj) => obj.Key && !obj.Key.endsWith("/.keep"))
    .map((obj) => ({
      key: obj.Key!,
      url: `${config.publicUrl}/${obj.Key}`,
      size: obj.Size || 0,
      lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
    }))
    .sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""));

  const folders = (result.CommonPrefixes || [])
    .map((p) => p.Prefix)
    .filter((p): p is string => Boolean(p));

  return { items, folders, nextToken: result.IsTruncated ? result.NextContinuationToken || null : null };
}

/** Deletes an object from R2 given its public URL (the same URL
 * uploadImageToR2/uploadDirectoryAsset returned). Silently does nothing
 * for a URL that isn't actually ours (e.g. R2 not configured, or a URL
 * from somewhere else), never throws, since a failed cleanup shouldn't
 * block the DB delete it's attached to. */
export async function deleteFromR2(url: string): Promise<void> {
  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return;
  const key = ownedPublicObjectKey(url, publicUrl);
  if (!key) return;

  try {
    const s3 = getS3Client(endpoint, accessKeyId, secretAccessKey);
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // best-effort, an orphaned R2 object is a smaller problem than a
    // failed admin action
  }
}
