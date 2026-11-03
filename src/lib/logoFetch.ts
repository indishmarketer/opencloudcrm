import sharp from "sharp";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { fetchSafeRemoteImage } from "@/lib/safeRemoteImage";

const SIZE = 256;

let cachedClient: S3Client | null = null;
function getS3Client(endpoint: string, accessKeyId: string, secretAccessKey: string): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  }
  return cachedClient;
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const { bytes: buf } = await fetchSafeRemoteImage(url);
    if (buf.slice(0, 15).toString("utf8").includes("<!DOCTYPE")) return null;
    return buf;
  } catch {
    return null;
  }
}

/** Tries the domain's own touch icon first, then Google's favicon proxy,
 * checking against a known-fake domain's response so we can tell a real
 * icon apart from Google's generic placeholder (same pattern already
 * proven in scripts/image-gen -- see image-generation-methodology.md).
 * Every result is normalized to a flat white 256x256 PNG so logos from
 * different sources look consistent next to each other. Returns null if
 * no real logo was discoverable, never a fabricated one. */
export async function findRealLogo(domain: string): Promise<Buffer | null> {
  const normalized = new URL(`https://${domain}`);
  if (normalized.hostname !== domain.toLowerCase() || normalized.port) return null;

  const ownIcon = await fetchBytes(new URL("/apple-touch-icon.png", normalized).toString());
  if (ownIcon) {
    try {
      return await sharp(ownIcon)
        .flatten({ background: "#ffffff" })
        .resize(SIZE, SIZE, { fit: "contain", background: "#ffffff" })
        .png()
        .toBuffer();
    } catch {
      // not a real decodable image, fall through
    }
  }

  const proxyUrl = (d: string) => {
    const url = new URL("https://www.google.com/s2/favicons");
    url.searchParams.set("domain", d);
    url.searchParams.set("sz", String(SIZE));
    return url.toString();
  };
  const [real, fake] = await Promise.all([
    fetchBytes(proxyUrl(domain)),
    fetchBytes(proxyUrl("thisdomaindoesnotexist12345.com")),
  ]);
  if (!real) return null;
  if (fake && real.length === fake.length) return null; // generic globe placeholder

  try {
    return await sharp(real)
      .flatten({ background: "#ffffff" })
      .resize(SIZE, SIZE, { fit: "contain", background: "#ffffff" })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/** Logo for a directory listing's link. Open source tools often have no
 * website, just a GitHub repo, and github.com's own icon would be wrong for
 * all of them, so a repo link uses the repo owner's avatar (the project or
 * org logo) and falls back to the normal domain lookup. */
export async function findToolLogo(link: string): Promise<Buffer | null> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www./, "").toLowerCase();
  if (host === "github.com") {
    const owner = url.pathname.split("/").filter(Boolean)[0];
    if (owner && /^[A-Za-z0-9-]{1,39}$/.test(owner)) {
      const avatar = await fetchBytes(`https://github.com/${owner}.png?size=${SIZE}`);
      if (avatar) {
        try {
          return await sharp(avatar)
            .flatten({ background: "#ffffff" })
            .resize(SIZE, SIZE, { fit: "contain", background: "#ffffff" })
            .png()
            .toBuffer();
        } catch {
          // not decodable, fall back to the domain lookup
        }
      }
    }
  }
  return findRealLogo(host);
}

export async function uploadDirectoryAsset(buf: Buffer, keyPrefix: string): Promise<string> {
  const endpoint = process.env.R2_S3_ENDPOINT!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const bucket = process.env.R2_BUCKET!;
  const publicUrl = process.env.R2_PUBLIC_URL!;

  const s3 = getS3Client(endpoint, accessKeyId, secretAccessKey);
  const key = `${keyPrefix}/${randomUUID()}.png`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: "image/png" }));
  return `${publicUrl}/${key}`;
}
