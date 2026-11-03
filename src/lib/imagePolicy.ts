import sharp from "sharp";

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const SHARP_FORMAT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Confirms the bytes are actually a decodable image of the claimed type,
 * not just a file whose Content-Type says so. A browser's `file.type` and a
 * remote server's Content-Type response header are both attacker-controlled
 * inputs, not facts -- sharp's metadata() parses the real image header
 * (magic bytes), so a mismatch here means the bytes are lying about what
 * they are (e.g. an HTML/script payload uploaded with a spoofed image MIME
 * type, which would otherwise be stored in R2 with that same attacker-
 * chosen Content-Type). */
export async function verifyImageBytes(bytes: Buffer, claimedMimeType: string): Promise<boolean> {
  const expectedFormat = SHARP_FORMAT_BY_MIME[claimedMimeType];
  if (!expectedFormat) return false;
  try {
    const { format } = await sharp(bytes).metadata();
    return format === expectedFormat;
  } catch {
    return false;
  }
}

export const MAX_SVG_SOURCE_LENGTH = 400_000;

/** An SVG an API/MCP client wrote by hand, on its way to being
 * rasterized. This is the one image path a hosted chat client can drive
 * end to end on its own: SVG is text, so a few KB of markup is well
 * within what a model can emit, where the same picture as base64 pixels
 * is not. The bytes stored are always the raster output, never the SVG,
 * so none of this is ever served to a browser as a document.
 *
 * Rejected rather than stripped, because every one of these means the
 * markup is trying to reach outside itself and the author should know:
 *
 * - External references (href/src to anything but a data: URI or an
 *   in-document #fragment). librsvg resolves those while rendering, on
 *   this server, which would turn "draw me a picture" into a fetch of
 *   any URL the caller chose -- cloud metadata endpoints included.
 * - <script> and <foreignObject>, which carry script and arbitrary HTML.
 * - Entity declarations, the XXE vector for file reads. */
export function rejectUnsafeSvg(source: string): string | null {
  if (source.length > MAX_SVG_SOURCE_LENGTH) {
    return `The SVG is ${source.length.toLocaleString()} characters, over the ${MAX_SVG_SOURCE_LENGTH.toLocaleString()} limit.`;
  }
  if (!/<svg[\s>]/i.test(source)) return "That does not look like SVG markup: no <svg> element found.";
  if (/<!ENTITY/i.test(source) || /<!DOCTYPE[^>]*\[/i.test(source)) {
    return "Entity declarations are not allowed in an SVG.";
  }
  if (/<\s*(script|foreignObject)[\s>]/i.test(source)) {
    return "<script> and <foreignObject> are not allowed in an SVG. Draw with shapes, paths, text, gradients and filters instead.";
  }
  const reference = /(?:xlink:href|href|src)\s*=\s*["']([^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = reference.exec(source))) {
    const value = match[1].trim();
    if (!value || value.startsWith("#") || /^data:image\//i.test(value)) continue;
    return `The SVG references "${value.slice(0, 120)}". An SVG rendered here may only reference an in-document #fragment or an inline data:image/ URI -- nothing fetched over the network. Rasterize or inline that asset first, or upload the finished image with sourceUrl instead.`;
  }
  return null;
}

/** Rasterizes hand-written SVG to PNG, the format the rest of the upload
 * path already understands (it is re-encoded to WebP downstream like any
 * other upload). width/height override the SVG's own intrinsic size,
 * which is how a client gets a crisp result out of markup authored at
 * arbitrary viewBox units. */
export async function rasterizeSvg(source: string, size?: { width?: number; height?: number }): Promise<Buffer> {
  // density, not just resize: librsvg rasterizes at this DPI before any
  // scaling, so text and thin strokes come out sharp instead of being
  // rendered small and then enlarged.
  const pipeline = sharp(Buffer.from(source, "utf8"), { density: 144 });
  if (size?.width || size?.height) {
    pipeline.resize({ width: size.width, height: size.height, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  return pipeline.png().toBuffer();
}
