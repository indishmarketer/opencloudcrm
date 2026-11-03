import { pool } from "@/lib/db";
import SupportThreads from "@/components/SupportThreads";
import { emailAt } from "@/config/brand";

export default async function ConsoleSupportPage() {
  const [submissions, replies, replyTemplate] = await Promise.all([
    pool.query(
      "SELECT id, name, email, message, created_at FROM contact_submissions ORDER BY created_at ASC"
    ),
    pool.query(
      "SELECT id, submission_id, admin_email, message, sent_at FROM contact_submission_replies ORDER BY sent_at ASC"
    ),
    pool.query("SELECT from_email FROM email_templates WHERE key = 'contact-form-reply'"),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Support</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Messages from the contact form, grouped into a conversation per person. Reply directly, no need to leave the dashboard.
      </p>
      <div className="mt-8">
        <SupportThreads submissions={submissions.rows} replies={replies.rows} replyFromEmail={replyTemplate.rows[0]?.from_email || emailAt("support")} />
      </div>
    </div>
  );
}
