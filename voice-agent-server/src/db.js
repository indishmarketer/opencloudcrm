import pg from "pg";

// Same Postgres instance as the main Next.js app -- share DATABASE_URL, do
// not stand up a second database. Schema lives in the main repo's
// scripts/migrations/029_voice_agent.sql, this service only reads/writes it.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function getSetting(key, fallback) {
  const result = await pool.query(
    "SELECT value FROM voice_agent_settings WHERE key = $1",
    [key]
  );
  return result.rows[0]?.value ?? fallback;
}

export async function getSettings() {
  const result = await pool.query("SELECT key, value FROM voice_agent_settings");
  const map = {};
  for (const row of result.rows) map[row.key] = row.value;
  return map;
}
