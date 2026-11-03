import test from "node:test";
import assert from "node:assert/strict";
import { base32Encode, base32Decode, totpCode, verifyTotp, generateTotpSecret, generateRecoveryCodes, hashRecoveryCode } from "../src/lib/totp.ts";

// RFC 6238 appendix B test secret ("12345678901234567890"), SHA1 column.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("totpCode matches the RFC 6238 SHA1 test vectors (last 6 digits)", () => {
  assert.equal(totpCode(RFC_SECRET, Math.floor(59 / 30)), "287082");
  assert.equal(totpCode(RFC_SECRET, Math.floor(1111111109 / 30)), "081804");
  assert.equal(totpCode(RFC_SECRET, Math.floor(1234567890 / 30)), "005924");
  assert.equal(totpCode(RFC_SECRET, Math.floor(2000000000 / 30)), "279037");
});

test("base32 round-trips", () => {
  const secret = generateTotpSecret();
  assert.equal(base32Encode(base32Decode(secret)), secret);
  assert.equal(base32Decode(secret).length, 20);
});

test("verifyTotp accepts current and adjacent steps, refuses replays and junk", () => {
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30000);
  const secret = generateTotpSecret();
  assert.equal(verifyTotp(secret, totpCode(secret, step), null, now), step);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 1), null, now), step - 1);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 3), null, now), null);
  assert.equal(verifyTotp(secret, totpCode(secret, step), step, now), null);
  assert.equal(verifyTotp(secret, "12345", null, now), null);
  assert.equal(verifyTotp(secret, "abcdef", null, now), null);
});

test("recovery codes are unique and hash case-insensitively", () => {
  const codes = generateRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  assert.match(codes[0], /^[a-z2-9]{4}-[a-z2-9]{4}$/);
  assert.equal(hashRecoveryCode(codes[0].toUpperCase()), hashRecoveryCode(codes[0]));
});
