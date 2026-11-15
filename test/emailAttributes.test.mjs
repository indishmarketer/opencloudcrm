import test from "node:test";
import assert from "node:assert/strict";
import { EMAIL_ATTRIBUTES, TEMPLATE_VARIABLES } from "../src/lib/messageVariables.ts";

test("email composers share unique attribute names for contact and tool workflows", () => {
  const tokens = EMAIL_ATTRIBUTES.map((attribute) => attribute.token);
  assert.equal(new Set(tokens).size, tokens.length);
  assert.deepEqual(TEMPLATE_VARIABLES, EMAIL_ATTRIBUTES);
  for (const token of ["first_name", "email", "data.tool_name", "data.website_url", "data.tool_url", "data.form_name", "data.page_url"]) {
    assert.ok(tokens.includes(token), `${token} is available in the shared catalog`);
  }
  assert.ok(EMAIL_ATTRIBUTES.every((attribute) => attribute.group && attribute.label));
});
