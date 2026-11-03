import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("console registrations uses the real webinar_access registration timestamp", async () => {
  const source = await readFile(new URL("../src/app/console/(protected)/webinars/[id]/registrations/page.tsx", import.meta.url), "utf8");
  assert.match(source, /wa\.registered_at/);
  assert.doesNotMatch(source, /wa\.created_at/);
});
