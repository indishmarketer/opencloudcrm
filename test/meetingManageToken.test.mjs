import assert from "node:assert/strict";
import test from "node:test";

test("meeting manage token round-trips to the exact booking id", async () => {
  const { createMeetingManageToken, verifyMeetingManageToken } = await import("../src/lib/meetingManageToken.ts");
  const token = await createMeetingManageToken(42);
  assert.equal(await verifyMeetingManageToken(token), 42);
});

test("meeting manage token for one booking does not verify for another", async () => {
  const { createMeetingManageToken, verifyMeetingManageToken } = await import("../src/lib/meetingManageToken.ts");
  const token = await createMeetingManageToken(1);
  const bookingId = await verifyMeetingManageToken(token);
  assert.notEqual(bookingId, 2);
});

test("garbage/tampered tokens are rejected, not thrown", async () => {
  const { verifyMeetingManageToken } = await import("../src/lib/meetingManageToken.ts");
  assert.equal(await verifyMeetingManageToken("not-a-real-token"), null);
  assert.equal(await verifyMeetingManageToken(""), null);
});

test("a token is reusable -- verifying it twice both succeed (unlike single-use magic links)", async () => {
  const { createMeetingManageToken, verifyMeetingManageToken } = await import("../src/lib/meetingManageToken.ts");
  const token = await createMeetingManageToken(7);
  assert.equal(await verifyMeetingManageToken(token), 7);
  assert.equal(await verifyMeetingManageToken(token), 7);
});
