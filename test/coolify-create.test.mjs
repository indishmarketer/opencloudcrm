import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("fresh Coolify setup creates one database and one rolling web app", async () => {
  const calls = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const path = request.url;
    calls.push({ method: request.method, path, body: body ? JSON.parse(body) : null });
    response.setHeader("Content-Type", "application/json");
    if (path === "/api/v1/databases/postgresql") {
      response.end(JSON.stringify({ uuid: "db123", internal_db_url: "postgres://opencloudcrm:secret@db123:5432/opencloudcrm" }));
    } else if (path === "/api/v1/databases/db123") {
      response.end(JSON.stringify({ status: "running:healthy" }));
    } else if (path === "/api/v1/applications/dockerimage") {
      response.end(JSON.stringify({ uuid: "app123" }));
    } else if (path === "/api/v1/applications/app123") {
      response.end(JSON.stringify({ status: "running:healthy" }));
    } else {
      response.end("{}");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const script = new URL("../deployment/coolify/create.mjs", import.meta.url);
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [fileURLToPath(script)], {
        env: {
          ...process.env,
          COOLIFY_URL: url,
          COOLIFY_TOKEN: "test-token",
          COOLIFY_PROJECT_UUID: "project123",
          COOLIFY_ENVIRONMENT_UUID: "environment123",
          COOLIFY_SERVER_UUID: "server123",
          SITE_URL: "https://example.com",
          ADMIN_EMAIL: "owner@example.com",
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => stdout += chunk);
      child.stderr.on("data", (chunk) => stderr += chunk);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Resources: database db123, application app123/);
    assert.doesNotMatch(result.stdout, /postgres:\/\//);
    assert.equal(calls.filter((call) => call.path === "/api/v1/databases/postgresql").length, 1);
    const apps = calls.filter((call) => call.path === "/api/v1/applications/dockerimage");
    assert.equal(apps.length, 1);
    assert.equal(apps[0].body.ports_exposes, "3000");
    assert.equal(apps[0].body.health_check_path, "/api/health");
    assert.equal(apps[0].body.ports_mappings, undefined);
    assert.equal(apps[0].body.custom_internal_name, undefined);
    assert.equal(calls.filter((call) => call.path === "/api/v1/applications/app123/scheduled-tasks").length, 3);
    const envs = calls.filter((call) => call.path === "/api/v1/applications/app123/envs");
    assert.equal(envs.find((call) => call.body.key === "DATABASE_URL").body.is_shown_once, false);
    assert.equal(envs.find((call) => call.body.key === "DATABASE_URL").body.is_buildtime, false);
    assert.equal(envs.find((call) => call.body.key === "SITE_URL").body.value, "https://example.com");
  } finally {
    server.close();
  }
});
