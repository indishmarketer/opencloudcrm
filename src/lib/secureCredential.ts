import crypto from "node:crypto";
import { getSessionSecret } from "@/lib/sessionSecret";

const PREFIX = "v1";

function key() {
  return crypto.createHash("sha256").update(`google-business:${getSessionSecret()}`).digest();
}

export function encryptCredential(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCredential(value: string): string {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== PREFIX || !iv || !tag || !ciphertext) throw new Error("Unsupported encrypted credential");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
