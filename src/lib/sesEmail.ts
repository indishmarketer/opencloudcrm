import crypto from "node:crypto";
import { htmlToText } from "@/lib/htmlToText";
import { SESv2Client, SendEmailCommand, GetAccountCommand } from "@aws-sdk/client-sesv2";
import { SITE_NAME } from "@/config/brand";

// The SESv2 "Simple" content type has no way to set custom headers, so
// List-Unsubscribe (required for every non-critical send, see email.ts)
// only works via "Raw" content: a hand-built RFC 5322 message. Kept
// deliberately simple -- HTML plus a plain-text copy, optional attachment
// parts -- this
// is not a general MIME library, just enough for what this app sends.

let cachedClient: SESv2Client | null = null;
function getClient(): SESv2Client | null {
  const region = process.env.SES_REGION;
  const accessKeyId = process.env.SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) return null;
  if (!cachedClient) {
    cachedClient = new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } });
  }
  return cachedClient;
}

/** RFC 2047 encoded-word, only when the subject actually needs it -- an
 * ASCII-only subject (the overwhelming majority) stays as plain text. */
function encodeHeaderValue(value: string): string {
  value = headerSafe(value);
  const isAscii = [...value].every((ch) => ch.charCodeAt(0) < 128);
  if (isAscii) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Header injection guard: a CR/LF in any header value (a subject built
 * from someone's name, an address) would let it add its own headers, like
 * Bcc. Every value that goes into a raw header passes through here. */
function headerSafe(value: string): string {
  return String(value).replace(/[\r\n\0]+/g, " ").trim();
}

/** Same, for a value inside a quoted parameter (attachment file names). */
function quotedParamSafe(value: string): string {
  return headerSafe(value).replace(/["\\]/g, "");
}

function chunkBase64(b64: string): string {
  return b64.replace(/(.{76})/g, "$1\r\n");
}

// Shown as the sender name in every inbox. It has to be in BOTH the raw
// From header and SESv2's FromEmailAddress: with only the bare address in
// FromEmailAddress, Gmail showed just "support" instead of the name.
const FROM_NAME = SITE_NAME;

function fromWithName(address: string): string {
  return `${FROM_NAME} <${headerSafe(address)}>`;
}

function buildRawMessage(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo: string;
  listUnsubscribe: string;
  listUnsubscribePost: string;
  attachments?: { name: string; content: string }[];
}): Buffer {
  const headers = [
    `From: ${fromWithName(opts.from)}`,
    `To: ${headerSafe(opts.to)}`,
    `Reply-To: ${headerSafe(opts.replyTo)}`,
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    "MIME-Version: 1.0",
    `List-Unsubscribe: <${headerSafe(opts.listUnsubscribe)}>`,
    `List-Unsubscribe-Post: ${headerSafe(opts.listUnsubscribePost)}`,
  ];

  const toBase64 = (text: string) => chunkBase64(Buffer.from(text, "utf8").toString("base64"));
  // HTML plus a plain-text copy: spam filters favour mail that has both,
  // and some readers and screen-reader setups prefer the text part.
  const altBoundary = `----=_Alt_${crypto.randomBytes(16).toString("hex")}`;
  const alternative =
    `--${altBoundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${toBase64(htmlToText(opts.html))}\r\n` +
    `--${altBoundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${toBase64(opts.html)}\r\n` +
    `--${altBoundary}--`;
  const alternativeType = `multipart/alternative; boundary="${altBoundary}"`;

  if (!opts.attachments?.length) {
    headers.push(`Content-Type: ${alternativeType}`);
    return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${alternative}\r\n`, "utf8");
  }

  const boundary = `----=_Part_${crypto.randomBytes(16).toString("hex")}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  let body = `--${boundary}\r\nContent-Type: ${alternativeType}\r\n\r\n${alternative}\r\n`;
  for (const att of opts.attachments) {
    const name = quotedParamSafe(att.name);
    body += `--${boundary}\r\nContent-Type: application/octet-stream; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${chunkBase64(att.content)}\r\n`;
  }
  body += `--${boundary}--`;
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8");
}

export type SesSendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

/** Sends one email through Amazon SES (SESv2 SendEmail, Raw content so
 * List-Unsubscribe survives). Called only from sendEmail() in email.ts. */
export async function sendViaSes(opts: {
  to: string;
  subject: string;
  html: string;
  from: string;
  replyTo: string;
  listUnsubscribe: string;
  listUnsubscribePost: string;
  attachments?: { name: string; content: string }[];
}): Promise<SesSendResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "SES credentials not configured" };

  const raw = buildRawMessage(opts);
  try {
    const result = await client.send(
      new SendEmailCommand({
        FromEmailAddress: fromWithName(opts.from),
        Destination: { ToAddresses: [opts.to] },
        Content: { Raw: { Data: raw } },
      })
    );
    return { ok: true, messageId: result.MessageId ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "SES send failed";
    console.error("SES send failed:", message);
    return { ok: false, error: message };
  }
}

export type SesAccountHealth =
  | { ok: true; enforcementStatus: string; sendingEnabled: boolean; sentLast24h: number; max24h: number }
  | { ok: false; error: string };

/** SES account standing (HEALTHY / PROBATION / SHUTDOWN) and quota. Needs
 * ses:GetAccount on the IAM user; without it this returns ok: false and the
 * health check falls back to our own bounce and complaint data. */
export async function getSesAccountHealth(): Promise<SesAccountHealth> {
  const client = getClient();
  if (!client) return { ok: false, error: "SES not configured" };
  try {
    const account = await client.send(new GetAccountCommand({}));
    return {
      ok: true,
      enforcementStatus: account.EnforcementStatus || "UNKNOWN",
      sendingEnabled: account.SendingEnabled !== false,
      sentLast24h: account.SendQuota?.SentLast24Hours ?? 0,
      max24h: account.SendQuota?.Max24HourSend ?? 0,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name || error.message : "GetAccount failed" };
  }
}
