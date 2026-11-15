import test from "node:test";
import assert from "node:assert/strict";
import { applyMessageVariables, contactMessageValues, unsupportedCampaignVariables } from "../src/lib/messageVariables.ts";

test("campaign attributes match the values supplied for each recipient", () => {
  const values = contactMessageValues({ name: "Asha Rao", email: "asha@example.com", phone: "+91 9876543210" });
  assert.equal(applyMessageVariables("Hi {{first_name}} {{name}} {{email}} {{phone}}", values),
    "Hi Asha Asha Rao asha@example.com +91 9876543210");
  assert.deepEqual(unsupportedCampaignVariables("{{first_name}} {{name}} {{email}} {{phone}}"), []);
  assert.deepEqual(unsupportedCampaignVariables("{{course_title}} {{course_url}} {{course_title}}"), ["course_title", "course_url"]);
});
