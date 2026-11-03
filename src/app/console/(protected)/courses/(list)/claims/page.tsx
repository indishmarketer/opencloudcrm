import { pool } from "@/lib/db";
import ConsoleCourseClaims from "@/components/ConsoleCourseClaims";

export default async function ConsoleCourseClaimsPage() {
  const result = await pool.query(`
    SELECT pc.id, pc.method, pc.reference, pc.created_at, u.email, c.title AS course_title
    FROM payment_claims pc
    JOIN users u ON u.id = pc.user_id
    JOIN courses c ON c.id = pc.course_id
    WHERE pc.status = 'pending'
    ORDER BY pc.created_at ASC
  `);

  return <ConsoleCourseClaims claims={result.rows} />;
}
