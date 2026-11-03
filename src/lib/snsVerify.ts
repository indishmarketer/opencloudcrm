import crypto from "node:crypto";

// Verifies an Amazon SNS HTTP(S) notification's signature so the SES bounce/
// complaint webhook can't be spoofed by a third party POSTing fake bounce
// data (which would let someone silently suppress any address on the site).
// No AWS SDK needed -- this is plain X.509/RSA verification per AWS's
// documented algorithm: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html

export type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL?: string;
  SubscribeURL?: string;
  Token?: string;
};

// Real SNS certs are always served from a *.amazonaws.com (or the China
// partition's *.amazonaws.com.cn) host under this path -- reject anything
// else before fetching it, so a forged message can't point us at an
// attacker-controlled "certificate" (SSRF / spoofed signature).
const CERT_URL_PATTERN = /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?\/SimpleNotificationService-[a-zA-Z0-9]+\.pem$/;

const certCache = new Map<string, { pem: string; fetchedAt: number }>();
const CERT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getSigningCert(url: string): Promise<string | null> {
  const cached = certCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CERT_CACHE_TTL_MS) return cached.pem;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const pem = await res.text();
    if (!pem.includes("BEGIN CERTIFICATE")) return null;
    certCache.set(url, { pem, fetchedAt: Date.now() });
    return pem;
  } catch {
    return null;
  }
}

function buildStringToSign(msg: SnsMessage): string {
  const fields =
    msg.Type === "Notification"
      ? ["Message", "MessageId", ...(msg.Subject !== undefined ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  return fields.map((key) => `${key}\n${(msg as unknown as Record<string, string>)[key]}\n`).join("");
}

/** Returns true only if the message's signature verifies against a genuine
 * AWS-served certificate. Callers must reject the request (not just log)
 * when this returns false. */
export async function verifySnsSignature(msg: SnsMessage): Promise<boolean> {
  if (!CERT_URL_PATTERN.test(msg.SigningCertURL)) return false;
  if (!msg.Signature || !msg.MessageId || !msg.TopicArn) return false;

  const pem = await getSigningCert(msg.SigningCertURL);
  if (!pem) return false;

  const algorithm = msg.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
  try {
    const verifier = crypto.createVerify(algorithm);
    verifier.update(buildStringToSign(msg), "utf8");
    return verifier.verify(pem, msg.Signature, "base64");
  } catch {
    return false;
  }
}
