import { pool } from "@/lib/db";
import ConsoleMeetingTypes from "@/components/ConsoleMeetingTypes";

export default async function ConsoleMeetingTypesPage() {
  const result = await pool.query(
    `SELECT id, slug, name, description, duration_minutes, calcom_event_type_id, active, created_at,
       (SELECT count(*)::int FROM meeting_bookings WHERE meeting_type_id = meeting_types.id) AS booking_count
     FROM meeting_types ORDER BY created_at DESC`
  );
  return <ConsoleMeetingTypes types={result.rows} />;
}
