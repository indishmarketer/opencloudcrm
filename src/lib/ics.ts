import { SITE_NAME, SITE_URL } from "@/config/brand";

const EMAIL_DOMAIN = new URL(SITE_URL).hostname.replace(/^www\./, "");

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** RFC5545 parameter values (e.g. CN=) use a different escaping rule than
 * property values: backslash-escaping (icsEscape) doesn't apply here -- a
 * value containing ':', ';', or ',' must instead be wrapped in a
 * quoted-string, which in turn can't contain a literal double-quote. */
function icsParamValue(value: string): string {
  const cleaned = value.replace(/["\r\n]/g, "");
  return /[:;,]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

/** A single-event .ics file per RFC 5545, minimal but valid: VCALENDAR,
 * VEVENT with UID/DTSTAMP/DTSTART/DTEND/SUMMARY/DESCRIPTION/URL. Lines are
 * CRLF-terminated as the spec requires. Used for the "Download .ics" link
 * on the booking confirmation page (GET /api/meetings/ics/[token]) -- a
 * plain PUBLISH file with no organizer/attendee, since it's a self-serve
 * download rather than a mailed invite. */
export function buildMeetingIcs(input: { uid: string; title: string; start: Date; end: Date; description?: string; url?: string }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${SITE_NAME}//Meetings//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(input.uid)}@${EMAIL_DOMAIN}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(input.start)}`,
    `DTEND:${icsDate(input.end)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    ...(input.description ? [`DESCRIPTION:${icsEscape(input.description)}`] : []),
    ...(input.url ? [`URL:${icsEscape(input.url)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** RFC5545 requires content lines to be folded at 75 octets, continuation
 * lines prefixed with a single space. Byte-aware so multi-byte characters
 * (attendee names, etc.) never get split mid-codepoint. */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let offset = 0;
  let limit = 75;
  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length);
    // Don't split a multi-byte UTF-8 sequence: back off while the next byte
    // is a continuation byte (10xxxxxx).
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(bytes.subarray(offset, end).toString("utf8"));
    offset = end;
    limit = 74; // continuation lines lose 1 octet to the leading space
  }
  return chunks.join("\r\n ");
}

export type IcsEventInput = {
  /** Stable per real-world event -- reused across the confirmation and every
   * reminder so calendar apps update the same entry instead of duplicating
   * it. A fresh UID (e.g. after a reschedule that changes the underlying
   * booking) creates a new entry. */
  uid: string;
  method: "REQUEST" | "CANCEL";
  sequence?: number;
  summary: string;
  description?: string;
  /** Shown as the event location -- typically the join URL. */
  location?: string;
  url?: string;
  start: Date;
  end: Date;
  organizerEmail: string;
  organizerName?: string;
  attendeeEmail: string;
  attendeeName?: string;
};

/** A mailable calendar invite (METHOD:REQUEST/CANCEL with ORGANIZER and
 * ATTENDEE) -- this is what Gmail/Outlook actually key off of to show the
 * "Add to calendar" banner on an email, unlike buildMeetingIcs's plain
 * PUBLISH file above, which is just a downloadable event with no invite
 * semantics. Attach via icsAttachment() below. */
export function buildIcsInvite(input: IcsEventInput): string {
  const status = input.method === "CANCEL" ? "CANCELLED" : "CONFIRMED";
  const lines = [
    "BEGIN:VCALENDAR",
    `PRODID:-//${SITE_NAME}//Scheduling//EN`,
    "VERSION:2.0",
    `METHOD:${input.method}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence ?? 0}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(input.start)}`,
    `DTEND:${icsDate(input.end)}`,
    `SUMMARY:${icsEscape(input.summary)}`,
    input.description ? `DESCRIPTION:${icsEscape(input.description)}` : null,
    input.location ? `LOCATION:${icsEscape(input.location)}` : null,
    input.url ? `URL:${icsEscape(input.url)}` : null,
    `ORGANIZER;CN=${icsParamValue(input.organizerName || SITE_NAME)}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${icsParamValue(input.attendeeName || input.attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.attendeeEmail}`,
    `STATUS:${status}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== null);
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Base64-encodes an .ics body into the {name, content} shape sendEmail()
 * expects for attachments. */
export function icsAttachment(icsContent: string, filename = "invite.ics"): { name: string; content: string } {
  return { name: filename, content: Buffer.from(icsContent, "utf8").toString("base64") };
}
