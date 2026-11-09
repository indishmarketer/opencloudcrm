#!/usr/bin/env node
// Create a fresh Coolify installation as two independent resources. This is
// deliberately separate from docker-compose.yml: Coolify cannot roll Compose.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

const required = (key) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseEnvFile(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) throw new Error("Invalid APP_ENV_FILE line; use KEY=value format");
    const raw = match[2].trim();
    values[match[1]] = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw;
  }
  return values;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const origin = required("COOLIFY_URL").replace(/\/+$/, "");
  const coolifyUrl = new URL(origin);
  if (coolifyUrl.protocol !== "https:" &&
      !(coolifyUrl.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(coolifyUrl.hostname))) {
    throw new Error("COOLIFY_URL must use HTTPS (except local testing)");
  }
  if (coolifyUrl.search || coolifyUrl.hash || !["/", "/api/v1"].includes(coolifyUrl.pathname)) {
    throw new Error("COOLIFY_URL must be a Coolify origin or end in /api/v1");
  }
  const token = required("COOLIFY_TOKEN");
  const projectUuid = required("COOLIFY_PROJECT_UUID");
  const serverUuid = required("COOLIFY_SERVER_UUID");
  const environmentUuid = required("COOLIFY_ENVIRONMENT_UUID");
  const siteUrl = new URL(required("SITE_URL"));
  const adminEmail = required("ADMIN_EMAIL");
  if (siteUrl.protocol !== "https:" && siteUrl.hostname !== "localhost") {
    throw new Error("SITE_URL must use HTTPS (except localhost)");
  }
  if (siteUrl.pathname !== "/" || siteUrl.search || siteUrl.hash) {
    throw new Error("SITE_URL must be an origin without a path, query, or fragment");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error("ADMIN_EMAIL is not a valid email address");
  }
  const extra = process.env.APP_ENV_FILE
    ? parseEnvFile(await readFile(process.env.APP_ENV_FILE, "utf8"))
    : {};
  const dbPassword = randomBytes(32).toString("base64url");
  const env = {
    ...extra,
    SESSION_SECRET: extra.SESSION_SECRET || randomBytes(48).toString("base64url"),
    CRON_SECRET: extra.CRON_SECRET || randomBytes(48).toString("base64url"),
    ADMIN_EMAIL: adminEmail,
    SITE_URL: siteUrl.origin,
  };
  delete env.DB_PASSWORD;
  delete env.DATABASE_URL;
  delete env.COOLIFY_TOKEN;
  const imageTag = process.env.OPEN_CLOUD_CRM_IMAGE_TAG || "latest";
  const apiBase = origin.endsWith("/api/v1") ? origin : `${origin}/api/v1`;
  console.log(`Plan: one PostgreSQL resource and one Docker Image application for ${siteUrl.host}.`);
  console.log("The web application will have no fixed host port or container name.");
  if (dryRun) return;

  async function api(method, path, body) {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Coolify errors can contain request details. Never print API payloads
      // because connection URLs and environment values can contain secrets.
      throw new Error(`Coolify ${method} ${path} returned HTTP ${response.status}`);
    }
    return payload;
  }
  async function waitFor(kind, uuid) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const resource = await api("GET", `/${kind}/${encodeURIComponent(uuid)}`);
      const status = resource.status || resource.data?.status || "";
      if (status === "running:healthy") return resource;
      if (/^(exited|failed|error)/i.test(status)) {
        throw new Error(`${kind} ${uuid} stopped with status ${status}`);
      }
      await pause(5_000);
    }
    throw new Error(`${kind} ${uuid} did not become healthy within five minutes`);
  }

  // Coolify returns the private database URL at creation on supported
  // versions. Stop safely if it cannot be retrieved; never guess the host.
  const db = await api("POST", "/databases/postgresql", {
    project_uuid: projectUuid,
    server_uuid: serverUuid,
    environment_uuid: environmentUuid,
    ...(process.env.COOLIFY_DESTINATION_UUID
      ? { destination_uuid: process.env.COOLIFY_DESTINATION_UUID }
      : {}),
    name: "opencloudcrm-db",
    image: "postgres:16-alpine",
    postgres_user: "opencloudcrm",
    postgres_db: "opencloudcrm",
    postgres_password: dbPassword,
    is_public: false,
    instant_deploy: false,
  });
  const dbUuid = db.uuid || db.data?.uuid;
  if (!dbUuid) throw new Error("Coolify created a database but returned no UUID; inspect the project before retrying");
  console.log(`Database created: ${dbUuid}`);
  await api("POST", `/databases/${encodeURIComponent(dbUuid)}/start`);
  const readyDb = await waitFor("databases", dbUuid);
  const dbUrl = db.internal_db_url || db.data?.internal_db_url ||
    readyDb.internal_db_url || readyDb.data?.internal_db_url;
  if (!dbUrl || !/^postgres(?:ql)?:\/\//.test(dbUrl)) {
    throw new Error(`Database ${dbUuid} is healthy, but Coolify did not return its internal URL. Configure the app with that URL from Coolify; do not rerun this command.`);
  }
  env.DATABASE_URL = dbUrl;

  const app = await api("POST", "/applications/dockerimage", {
    project_uuid: projectUuid,
    server_uuid: serverUuid,
    environment_uuid: environmentUuid,
    ...(process.env.COOLIFY_DESTINATION_UUID
      ? { destination_uuid: process.env.COOLIFY_DESTINATION_UUID }
      : {}),
    name: "opencloudcrm-web",
    docker_registry_image_name: "ghcr.io/indishmarketer/opencloudcrm",
    docker_registry_image_tag: imageTag,
    domains: siteUrl.origin,
    autogenerate_domain: false,
    ports_exposes: "3000",
    health_check_enabled: true,
    health_check_path: "/api/health",
    health_check_method: "GET",
    health_check_return_code: 200,
    health_check_interval: 10,
    health_check_timeout: 5,
    health_check_retries: 5,
    health_check_start_period: 180,
    rolling_update_drain_seconds: 10,
    stop_grace_period: 30,
    instant_deploy: false,
  });
  const appUuid = app.uuid || app.data?.uuid;
  if (!appUuid) throw new Error(`Coolify created the application but returned no UUID. Database: ${dbUuid}; inspect before retrying`);
  console.log(`Web application created: ${appUuid}`);
  for (const [key, value] of Object.entries(env)) {
    if (value === "") continue;
    await api("POST", `/applications/${encodeURIComponent(appUuid)}/envs`, {
      key,
      value,
      // Coolify must retain DATABASE_URL on later rolling deployments. On the
      // tested server, saving it as a shown-once build variable caused the
      // first launch to work but the next deployment to lose the variable.
      is_shown_once: key !== "DATABASE_URL" && /(?:SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY)/.test(key),
      ...(key === "DATABASE_URL" ? { is_runtime: true, is_buildtime: false } : {}),
    });
  }
  await api("POST", `/applications/${encodeURIComponent(appUuid)}/start`);
  await waitFor("applications", appUuid);
  console.log("Web application is healthy.");
  const tasks = [
    ["Reminders", "* * * * *", "minute", 120],
    ["Email and webhooks", "*/5 * * * *", "five-minute", 120],
    ["Daily maintenance", "0 2 * * *", "daily", 1200],
  ];
  for (const [name, frequency, mode, timeout] of tasks) {
    await api("POST", `/applications/${encodeURIComponent(appUuid)}/scheduled-tasks`, {
      name,
      frequency,
      command: `sh /app/scripts/cron/run-once.sh ${mode}`,
      timeout,
      enabled: true,
    });
  }
  console.log(`Ready: ${siteUrl.origin}. Resources: database ${dbUuid}, application ${appUuid}.`);
  console.log("On the next update, verify Coolify reports a rolling update and probe the public URL throughout it.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
