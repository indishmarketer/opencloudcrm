import test from "node:test";
import assert from "node:assert/strict";
import { encryptCredential, decryptCredential } from "../src/lib/secureCredential.ts";

test("secure credentials round-trip without storing plaintext", () => {
  const encrypted = encryptCredential("refresh-token-secret");
  assert.notEqual(encrypted, "refresh-token-secret");
  assert.equal(decryptCredential(encrypted), "refresh-token-secret");
});

test("secure credentials reject tampering", () => {
  const encrypted = encryptCredential("refresh-token-secret");
  const parts = encrypted.split(".");
  parts[3] = (parts[3][0] === "a" ? "b" : "a") + parts[3].slice(1);
  assert.throws(() => decryptCredential(parts.join(".")));
});
