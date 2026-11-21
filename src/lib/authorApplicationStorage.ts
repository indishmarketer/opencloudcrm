import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

export const MAX_AUTHOR_DOCUMENT_SIZE = 10 * 1024 * 1024;

const TYPES: Record<string, { contentType: string; label: string }> = {
  pdf: { contentType: "application/pdf", label: "PDF" },
  doc: { contentType: "application/msword", label: "Word document" },
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word document",
  },
  odt: { contentType: "application/vnd.oasis.opendocument.text", label: "OpenDocument file" },
  txt: { contentType: "text/plain", label: "text file" },
  md: { contentType: "text/markdown", label: "Markdown file" },
};

let cachedClient: S3Client | null = null;

function storageConfig(): { client: S3Client; bucket: string } | null {
  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  cachedClient ??= new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client: cachedClient, bucket };
}

function extension(name: string): string {
  return name.toLowerCase().split(".").pop() || "";
}

function bytesMatchType(bytes: Buffer, ext: string): boolean {
  if (ext === "pdf") return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  if (ext === "doc") return bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (ext === "docx" || ext === "odt") return bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (ext === "txt" || ext === "md") return !bytes.subarray(0, 4096).includes(0);
  return false;
}

export type StoredAuthorDocument = {
  key: string;
  name: string;
  contentType: string;
  size: number;
};

export async function uploadAuthorDocument(
  file: File,
  applicationToken: string,
  kind: "sample" | "submission",
): Promise<StoredAuthorDocument | { error: string }> {
  const ext = extension(file.name);
  const type = TYPES[ext];
  if (!type) return { error: "Upload a PDF, DOC, DOCX, ODT, TXT, or Markdown file." };
  if (file.size <= 0) return { error: "The selected file is empty." };
  if (file.size > MAX_AUTHOR_DOCUMENT_SIZE) return { error: "The file must be 10 MB or smaller." };

  const config = storageConfig();
  if (!config) return { error: "Document storage is not configured." };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytesMatchType(bytes, ext)) return { error: `That does not appear to be a valid ${type.label}.` };

  const key = `author-applications/${applicationToken}/${kind}/${randomUUID()}.${ext}`;
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: bytes,
    ContentType: type.contentType,
  }));
  return { key, name: file.name.slice(0, 240), contentType: type.contentType, size: file.size };
}

export async function readAuthorDocument(key: string): Promise<Buffer | null> {
  const config = storageConfig();
  if (!config || !key.startsWith("author-applications/")) return null;
  try {
    const result = await config.client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    if (!result.Body) return null;
    return Buffer.from(await result.Body.transformToByteArray());
  } catch {
    return null;
  }
}

export async function deleteAuthorDocument(
  key: string | null,
  options: { strict?: boolean } = {},
): Promise<void> {
  const config = storageConfig();
  if (!key) return;
  if (!key.startsWith("author-applications/")) {
    if (options.strict) throw new Error("Refusing to delete an unknown storage key.");
    return;
  }
  if (!config) {
    if (options.strict) throw new Error("Document storage is not configured.");
    return;
  }
  try {
    await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) {
    if (options.strict) throw error;
  }
}
