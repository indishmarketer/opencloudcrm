import { pool } from "@/lib/db";
import ConsoleWebinars from "@/components/ConsoleWebinars";

export default async function ConsoleWebinarsPage() {
  const result = await pool.query(`SELECT w.*,
    (SELECT count(*)::int FROM webinar_access wa WHERE wa.webinar_id = w.id) AS registration_count,
    (SELECT count(*)::int FROM webinar_comments wc WHERE wc.webinar_id = w.id AND wc.is_question = true) AS question_count,
    (SELECT count(*)::int FROM webinar_schedules ws WHERE ws.webinar_id = w.id AND ws.active = true) AS active_schedule_count
    FROM webinars w ORDER BY w.updated_at DESC`);
  return <ConsoleWebinars initialWebinars={result.rows} />;
}
