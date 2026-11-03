import crypto from "node:crypto";
import { SignJWT } from "jose";

/**
 * Server-side Mux client.
 *
 * Env vars (not yet in Coolify, see task notes):
 *  - MUX_TOKEN_ID / MUX_TOKEN_SECRET  -> Basic Auth for Video API
 *  - MUX_SIGNING_KEY_ID / MUX_SIGNING_KEY_PRIVATE -> RS256 private key for signed playback (base64-encoded PEM)
 *  - MUX_WEBHOOK_SECRET -> HMAC secret for inbound webhook verification (Mux-Signature header)
 */

const MUX_API_BASE = "https://api.mux.com";

function muxAuthHeader(): string {
  const id = process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) throw new Error("Mux API credentials are not configured (MUX_TOKEN_ID / MUX_TOKEN_SECRET).");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

function corsOriginForRequest(requestOrigin?: string | null): string {
  if (requestOrigin && /^https:\/\/[^\s]+$/.test(requestOrigin)) return requestOrigin;
  return "*";
}

// ---------------------------------------------------------------------------
// Direct upload
// ---------------------------------------------------------------------------

export type MuxDirectUpload = {
  id: string;
  status: string;
  url: string;
  timeout: number;
  created_at: string;
};

export async function createMuxDirectUpload(opts: {
  corsOrigin?: string;
  passthrough?: string;
  test?: boolean;
}): Promise<MuxDirectUpload> {
  const cors_origin = corsOriginForRequest(opts.corsOrigin || null);
  const body: Record<string, unknown> = {
    cors_origin,
    new_asset_settings: {
      // Signed playback so URLs aren't publicly scrapable.
      playback_policies: ["signed"],
      video_quality: "basic",
      ...(opts.passthrough ? { passthrough: opts.passthrough.slice(0, 255) } : {}),
    },
    ...(opts.test ? { test: true } : {}),
    timeout: 3600,
  };

  const res = await fetch(`${MUX_API_BASE}/video/v1/uploads`, {
    method: "POST",
    headers: {
      Authorization: muxAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mux create upload failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data: MuxDirectUpload };
  return json.data;
}

export async function getMuxDirectUpload(uploadId: string): Promise<MuxDirectUpload | null> {
  const res = await fetch(`${MUX_API_BASE}/video/v1/uploads/${encodeURIComponent(uploadId)}`, {
    headers: { Authorization: muxAuthHeader() },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mux get upload failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data: MuxDirectUpload };
  return json.data;
}

// ---------------------------------------------------------------------------
// Asset lookup
// ---------------------------------------------------------------------------

export type MuxAsset = {
  id: string;
  status: string;
  duration?: number;
  playback_ids?: Array<{ id: string; policy: string }>;
  passthrough?: string;
  created_at?: string;
};

export function muxWebhookIdentifiers(type: string, data: Record<string, unknown>): {
  assetId: string | null;
  uploadId: string | null;
  passthrough: string | null;
} {
  const value = (candidate: unknown) => typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
  const isUploadEvent = type.startsWith("video.upload.");
  const dataId = value(data.id);
  return {
    assetId: isUploadEvent ? value(data.asset_id) : (dataId || value(data.asset_id)),
    uploadId: isUploadEvent ? dataId : (value(data.upload_id) || value(data.uploadId)),
    passthrough: value(data.passthrough),
  };
}

export async function getMuxAsset(assetId: string): Promise<MuxAsset | null> {
  const res = await fetch(`${MUX_API_BASE}/video/v1/assets/${encodeURIComponent(assetId)}`, {
    headers: { Authorization: muxAuthHeader() },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mux get asset failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data: MuxAsset };
  return json.data;
}

export async function deleteMuxAsset(assetId: string): Promise<void> {
  const res = await fetch(`${MUX_API_BASE}/video/v1/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
    headers: { Authorization: muxAuthHeader() },
  });
  if (res.status === 404 || res.status === 204) return;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mux delete asset failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

export async function cancelMuxDirectUpload(uploadId: string): Promise<void> {
  const res = await fetch(`${MUX_API_BASE}/video/v1/uploads/${encodeURIComponent(uploadId)}/cancel`, {
    method: "PUT",
    headers: { Authorization: muxAuthHeader(), "Content-Type": "application/json" },
  });
  if (res.status === 404 || res.status === 409) return;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Mux only permits cancellation while the upload is waiting. Once an
    // asset exists, asset deletion is the correct cleanup path.
    if (res.status === 400 && /waiting|cancel/i.test(body)) return;
    throw new Error(`Mux cancel upload failed (${res.status}): ${body.slice(0, 500)}`);
  }
}

// ---------------------------------------------------------------------------
// Signed playback JWT
// ---------------------------------------------------------------------------

function decodeMuxPrivateKey(raw: string): string {
  const normalize = (value: string) => value.trim().replace(/\\n/g, "\n");
  const trimmed = normalize(raw);
  if (/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(trimmed)) return trimmed;
  // The Mux API returns a base64-encoded PKCS#1 PEM. Coolify may preserve
  // its line breaks as literal backslash-n sequences, so normalize those too.
  try {
    const decoded = normalize(Buffer.from(trimmed, "base64").toString("utf-8"));
    if (/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(decoded)) return decoded;
  } catch {
    // fall through
  }
  return trimmed;
}

export async function signMuxPlaybackToken(
  playbackId: string,
  opts: { expirationSeconds?: number; type?: "video" | "thumbnail" | "gif" | "storyboard"; params?: Record<string, unknown> } = {},
): Promise<string | null> {
  const keyId = process.env.MUX_SIGNING_KEY_ID;
  const privateKeyRaw = process.env.MUX_SIGNING_KEY_PRIVATE;
  if (!keyId || !privateKeyRaw) return null;

  const pem = decodeMuxPrivateKey(privateKeyRaw);
  const privateKey = crypto.createPrivateKey(pem);
  const expSeconds = opts.expirationSeconds ?? 60 * 60 * 2; // 2 hours default
  const aud = opts.type === "thumbnail" ? "t" : opts.type === "gif" ? "g" : opts.type === "storyboard" ? "s" : "v";

  const jwt = await new SignJWT({
    sub: playbackId,
    aud,
    exp: Math.floor(Date.now() / 1000) + expSeconds,
    kid: keyId,
    ...(opts.params || {}),
  })
    .setProtectedHeader({ alg: "RS256", kid: keyId, typ: "JWT" })
    .setSubject(playbackId)
    .setAudience(aud)
    .setExpirationTime(`${expSeconds}s`)
    .sign(privateKey);

  return jwt;
}

export async function getSignedMuxPlaybackUrl(playbackId: string): Promise<string> {
  const token = await signMuxPlaybackToken(playbackId, { type: "video" });
  if (token) return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

// For thumbnails we also sign if keys are present.
export async function getSignedMuxThumbnailUrl(playbackId: string, opts: { time?: number; width?: number } = {}): Promise<string> {
  const params: Record<string, unknown> = {};
  if (opts.time != null) params.time = String(opts.time);
  if (opts.width != null) params.width = String(opts.width);
  const token = await signMuxPlaybackToken(playbackId, { type: "thumbnail", params: Object.keys(params).length ? params : undefined });
  const base = `https://image.mux.com/${playbackId}/thumbnail.jpg`;
  const search = new URLSearchParams(params as Record<string, string>);
  if (token) search.set("token", token);
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (Mux-Signature: t=...,v1=...)
// ---------------------------------------------------------------------------

export function verifyMuxWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;

  // Parse header: t=123,v1=abc[,v1=def...]. Ignore v0 and other versions.
  const parts = signatureHeader.split(",");
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t" && v) timestamp = v.trim();
    else if (k === "v1" && v) signatures.push(v.trim());
  }
  if (!timestamp || signatures.length === 0) return false;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  // Replay tolerance: 5 minutes (Mux SDK default is 300s). Allow 5 min window.
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > 300) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");

  // At least one v1 signature must match (timing-safe).
  for (const sig of signatures) {
    if (sig.length !== expected.length) continue;
    try {
      if (crypto.timingSafeEqual(Buffer.from(sig, "utf-8"), Buffer.from(expected, "utf-8"))) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Helper to generate a valid Mux-Signature header for tests.
 * Matches compute: HMAC-SHA256(secret, `${timestamp}.${payload}`) -> hex
 */
export function buildMuxSignatureHeader(payload: string, secret: string, timestamp?: number): string {
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  const signed = `${ts}.${payload}`;
  const sig = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${ts},v1=${sig}`;
}
