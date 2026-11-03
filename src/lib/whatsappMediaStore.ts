import { randomUUID } from "crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Storage for the photos and videos that go through a WhatsApp
 * conversation, in a bucket of its own with **no public access**.
 *
 * This is deliberately not the images bucket. That one is served by the
 * public asset CDN domain (NEXT_PUBLIC_ASSET_DOMAIN), so anything in it is
 * readable by anyone who has the URL, for good -- fine for a blog picture, wrong for whatever a
 * customer happens to send us, which could be an ID document or a bank
 * screenshot. Here nothing is reachable without our own credentials.
 *
 * Meta still has to fetch an outbound file from a URL, so a send signs a
 * short-lived one. It is enough: Meta downloads the file during the send
 * call itself and serves its own copy to the recipient from then on.
 *
 * Template header samples stay in the public bucket on purpose. They are
 * our own marketing images rather than anyone's private data, and every
 * send of an approved template points at the same file for as long as the
 * template exists. */

const SIGNED_URL_SECONDS = 60 * 60;

let cached: S3Client | null = null;
function client(): S3Client | null {
  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket()) return null;
  if (!cached) {
    cached = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  }
  return cached;
}

function bucket(): string | undefined {
  return process.env.R2_WHATSAPP_BUCKET;
}

export function isConversationMediaConfigured(): boolean {
  return Boolean(client());
}

/** What a stored file is, worked out from its key, so the console knows
 * whether to draw a picture, a player or a link. */
export type MediaKind = "image" | "video" | "audio" | "file";

export function mediaKindFromName(name: string): MediaKind {
  if (/\.(mp4|mov|3gp)(\?|$)/i.test(name)) return "video";
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(name)) return "image";
  if (/\.(mp3|ogg|oga|m4a|aac|wav)(\?|$)/i.test(name)) return "audio";
  return "file";
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  pdf: "application/pdf",
};

/** Puts a file in the private bucket and returns its key. The key, not a
 * URL: there is no URL that works without being signed first, which is the
 * whole point. */
export async function putConversationMedia(
  bytes: Uint8Array,
  ext: string,
  contentType: string,
): Promise<{ key: string } | { error: string }> {
  const s3 = client();
  if (!s3) return { error: "WhatsApp media storage is not configured." };
  const key = `conversations/${randomUUID()}.${ext}`;
  try {
    await s3.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: bytes, ContentType: contentType }));
    return { key };
  } catch {
    return { error: "Could not store that file." };
  }
}

/** A URL Meta can fetch the file from, valid for an hour. Meta downloads it
 * while the send request is still open, so this never has to outlive the
 * send by much. */
export async function signConversationMedia(key: string, seconds = SIGNED_URL_SECONDS): Promise<string | null> {
  const s3 = client();
  if (!s3) return null;
  try {
    return await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: seconds });
  } catch {
    return null;
  }
}

/** Reads a file back for the console to show. Returns the body as bytes
 * rather than a stream URL, because the console must never be handed
 * anything that works outside its own session. */
export async function readConversationMedia(
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const s3 = client();
  if (!s3) return null;
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;
    const ext = key.split(".").pop()?.toLowerCase() || "";
    return { bytes, contentType: result.ContentType || CONTENT_TYPES[ext] || "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Best effort, like every other delete here: an object left behind is a
 * smaller problem than an admin action that fails halfway. */
export async function deleteConversationMedia(key: string): Promise<void> {
  const s3 = client();
  if (!s3) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch {
    // nothing useful to do; the retention sweep will try again
  }
}
