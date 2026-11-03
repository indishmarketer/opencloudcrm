import assert from "node:assert/strict";
import test from "node:test";

test("buildMeetingIcs produces a valid single-event calendar with escaped fields", async () => {
  const { buildMeetingIcs } = await import("../src/lib/ics.ts");
  const ics = buildMeetingIcs({
    uid: "abc123",
    title: "15 Min Discovery Call, with notes",
    start: new Date("2026-09-01T10:00:00.000Z"),
    end: new Date("2026-09-01T10:15:00.000Z"),
    description: "Line one\nLine two",
    url: "https://app.cal.com/video/abc123",
  });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.match(ics, /UID:abc123@example\.com/);
  assert.match(ics, /DTSTART:20260901T100000Z/);
  assert.match(ics, /DTEND:20260901T101500Z/);
  assert.match(ics, /SUMMARY:15 Min Discovery Call\\, with notes/);
  assert.match(ics, /DESCRIPTION:Line one\\nLine two/);
  assert.match(ics, /URL:https:\/\/app\.cal\.com\/video\/abc123/);
});

test("buildMeetingIcs omits optional fields cleanly when not provided", async () => {
  const { buildMeetingIcs } = await import("../src/lib/ics.ts");
  const ics = buildMeetingIcs({
    uid: "xyz",
    title: "Call",
    start: new Date("2026-09-01T10:00:00.000Z"),
    end: new Date("2026-09-01T10:15:00.000Z"),
  });
  assert.equal(ics.includes("DESCRIPTION:"), false);
  assert.equal(ics.includes("URL:"), false);
});

test("buildIcsInvite produces a mailable REQUEST invite with organizer/attendee", async () => {
  const { buildIcsInvite } = await import("../src/lib/ics.ts");
  const ics = buildIcsInvite({
    uid: "meeting-abc123@example.com",
    method: "REQUEST",
    summary: "15 Min Discovery Call, with notes",
    description: "Join here: https://app.cal.com/video/abc123",
    location: "https://app.cal.com/video/abc123",
    url: "https://app.cal.com/video/abc123",
    start: new Date("2026-09-01T10:00:00.000Z"),
    end: new Date("2026-09-01T10:15:00.000Z"),
    organizerEmail: "info@example.com",
    attendeeEmail: "attendee@example.com",
    attendeeName: "Jane Doe",
  });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /UID:meeting-abc123@example\.com\r\n/);
  assert.match(ics, /DTSTART:20260901T100000Z/);
  assert.match(ics, /DTEND:20260901T101500Z/);
  assert.match(ics, /SUMMARY:15 Min Discovery Call\\, with notes/);
  assert.match(ics, /ORGANIZER;CN=My Business:mailto:info@example\.com/);
  // The ATTENDEE line is long enough to be folded per RFC5545 (continuation
  // line starts with a space), so match across the fold rather than as one
  // unbroken line.
  assert.match(ics, /ATTENDEE;CN=Jane Doe;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:m\r\n ailto:attendee@example\.com/);
  assert.match(ics, /STATUS:CONFIRMED/);
});

test("buildIcsInvite produces a CANCEL invite with the same UID", async () => {
  const { buildIcsInvite } = await import("../src/lib/ics.ts");
  const ics = buildIcsInvite({
    uid: "meeting-abc123@indishmarketer.com",
    method: "CANCEL",
    summary: "15 Min Discovery Call",
    start: new Date("2026-09-01T10:00:00.000Z"),
    end: new Date("2026-09-01T10:15:00.000Z"),
    organizerEmail: "info@indishmarketer.com",
    attendeeEmail: "attendee@example.com",
  });
  assert.match(ics, /METHOD:CANCEL/);
  assert.match(ics, /UID:meeting-abc123@indishmarketer\.com\r\n/);
  assert.match(ics, /STATUS:CANCELLED/);
});

test("buildIcsInvite folds long lines at 75 octets per RFC5545", async () => {
  const { buildIcsInvite } = await import("../src/lib/ics.ts");
  const longSummary = "A".repeat(120);
  const ics = buildIcsInvite({
    uid: "meeting-long@indishmarketer.com",
    method: "REQUEST",
    summary: longSummary,
    start: new Date("2026-09-01T10:00:00.000Z"),
    end: new Date("2026-09-01T10:15:00.000Z"),
    organizerEmail: "info@indishmarketer.com",
    attendeeEmail: "attendee@example.com",
  });
  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `line exceeds 75 octets: ${line}`);
  }
  assert.match(ics, /SUMMARY:A+\r\n A+\r\n/);
});

test("buildIcsInvite quotes CN parameter values containing reserved characters", async () => {
  const { buildIcsInvite } = await import("../src/lib/ics.ts");
  const ics = buildIcsInvite({
    uid: "meeting-comma@indishmarketer.com",
    method: "REQUEST",
    summary: "Call",
    start: new Date("2026-09-01T10:00:00.000Z"),
    end: new Date("2026-09-01T10:15:00.000Z"),
    organizerEmail: "info@indishmarketer.com",
    attendeeEmail: "attendee@example.com",
    attendeeName: "Doe, Jane",
  });
  // A bare comma in an unquoted CN param value would be misread as a second
  // parameter value; RFC5545 requires quoting instead of backslash-escaping
  // here (property VALUE escaping and parameter-VALUE quoting are distinct).
  assert.match(ics, /ATTENDEE;CN="Doe, Jane";ROLE=REQ-PARTICIPANT/);
});

test("icsAttachment base64-encodes the ics body for the sendEmail attachment shape", async () => {
  const { icsAttachment } = await import("../src/lib/ics.ts");
  const attachment = icsAttachment("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", "invite.ics");
  assert.equal(attachment.name, "invite.ics");
  assert.equal(Buffer.from(attachment.content, "base64").toString("utf8"), "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
});
