import { pool } from "@/lib/db";

export type AuthorApplicationStatus =
  | "pending"
  | "approved"
  | "draft_submitted"
  | "changes_requested"
  | "accepted"
  | "rejected";

export type AuthorApplication = {
  id: number;
  user_id: number;
  applicant_name: string | null;
  applicant_email: string;
  topics: string;
  sample_url: string | null;
  status: AuthorApplicationStatus;
  submission_url: string | null;
  submission_note: string | null;
  admin_note: string | null;
  social_links: string | null;
  blog_author_id: number | null;
  reviewed_at: string | null;
  created_at: string;
};

export async function getPendingApplication(userId: number): Promise<{ id: number } | null> {
  const result = await pool.query(
    "SELECT id FROM author_applications WHERE user_id = $1 AND status = 'pending'",
    [userId]
  );
  return result.rows[0] || null;
}

// The one page at /apply-to-write has to render whichever stage the
// logged-in member's application is actually in (approved and waiting on a
// draft link, changes requested, accepted and waiting on socials, etc), not
// just whether one is pending -- so it needs the latest application in any
// status, not only a pending one.
export async function getLatestApplicationForUser(userId: number): Promise<AuthorApplication | null> {
  const result = await pool.query(
    `SELECT aa.*, u.name AS applicant_name, u.email AS applicant_email
     FROM author_applications aa
     JOIN users u ON u.id = aa.user_id
     WHERE aa.user_id = $1
     ORDER BY aa.created_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function listAuthorApplications(): Promise<AuthorApplication[]> {
  const result = await pool.query(
    `SELECT aa.*, u.name AS applicant_name, u.email AS applicant_email
     FROM author_applications aa
     JOIN users u ON u.id = aa.user_id
     ORDER BY aa.status = 'pending' DESC,
              aa.status IN ('draft_submitted', 'changes_requested') DESC,
              aa.created_at DESC
     LIMIT 200`
  );
  return result.rows;
}
