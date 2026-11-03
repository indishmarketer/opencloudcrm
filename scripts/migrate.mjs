// Portable migration runner: applies scripts/migrations/*.sql in order
// against DATABASE_URL, tracking what's already run in a schema_migrations
// table. This is the self-hoster path -- plain `pg` + DATABASE_URL, no SSH,
// no Coolify, no dependency on this project's own production access.
// This owner's own production DB isn't reachable this way (see
// scripts/db-mcp/server.mjs's SSH + `docker exec psql` bridge instead);
// this script is for anyone else's deployment, including local dev.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "scripts", "migrations");
const statusOnly = process.argv.includes("--status");

// Mirrors Next.js's own precedence (.env.local overrides .env) -- a
// standalone script gets none of that for free, unlike `next dev`/`build`.
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (checked .env, .env.local, and the environment). See .env.example.");
  process.exit(1);
}

function listLocalMigrations() {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query("SELECT filename FROM schema_migrations ORDER BY filename;");
    const applied = new Set(rows.map((r) => r.filename));
    const local = listLocalMigrations();
    const pending = local.filter((name) => !applied.has(name));

    if (statusOnly) {
      console.log(`${applied.size} applied, ${pending.length} pending.`);
      if (pending.length) console.log(pending.map((n) => `  ${n}`).join("\n"));
      return;
    }

    if (pending.length === 0) {
      console.log("Nothing pending -- every local migration is already tracked as applied.");
      return;
    }

    for (const name of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8");
      if (!sql.trim()) {
        console.log(`${name}: skipped (empty file)`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING", [name]);
        await client.query("COMMIT");
        console.log(`${name}: applied`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`${name}: FAILED -- ${err.message || err}`);
        process.exitCode = 1;
        return;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
