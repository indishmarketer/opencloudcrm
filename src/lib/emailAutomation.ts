import { pool } from "@/lib/db";
import { escapeHtml } from "@/lib/escapeHtml";
import { ensureContact } from "@/lib/contacts";
import { buildSegmentPredicate } from "@/lib/contactSegments";
import { contactMessageValues } from "@/lib/messageVariables";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { emitWebhookEvent } from "@/lib/webhookEvents";

export const EMAIL_TRIGGERS = [
  { key: "user_signup_verified", label: "Someone verifies their email (any new account)", courseScoped: false },
  { key: "course_enroll_free", label: "Someone enrolls free in a course", courseScoped: true },
  { key: "course_purchase", label: "Someone buys a PRO course directly", courseScoped: true },
  { key: "course_upgrade_to_pro", label: "Someone upgrades from free to PRO on a course", courseScoped: true },
  { key: "course_inactivity", label: "Someone is inactive after enrolling / completing a lesson", courseScoped: true },
  { key: "course_completed", label: "Someone completes every accessible lesson in a course", courseScoped: true },
  { key: "newsletter_signup", label: "Someone confirms a newsletter signup", courseScoped: false },
  { key: "community_inactivity", label: "A community member has not created their first post", courseScoped: false },
] as const;

export type EmailTriggerKey = (typeof EMAIL_TRIGGERS)[number]["key"];
export type AutomationGoal = "none" | "course_pro" | "course_completed" | "community_first_post";

function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(vars[key] ?? ""));
}

export function firstNameOf(fullName: string | null | undefined): string {
  const trimmed = (fullName || "").trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "there";
}

async function contactMatchesSegment(contactId: number, segmentId: number): Promise<boolean> {
  const segment = await pool.query("SELECT rules FROM contact_segments WHERE id = $1", [segmentId]);
  if (!segment.rows[0]) return false;
  const predicate = buildSegmentPredicate(segment.rows[0].rules, 2);
  const result = await pool.query(
    `SELECT 1 FROM contacts c WHERE c.id = $1 AND ${predicate.sql} LIMIT 1`,
    [contactId, ...predicate.values],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Checked immediately before every send so a later purchase or completion
 * automatically stops the remaining journey. */
export async function automationGoalReached(
  goal: AutomationGoal,
  recipientEmail: string,
  courseId: number | null,
): Promise<boolean> {
  if (goal === "none") return false;
  if (goal === "community_first_post") {
    const result = await pool.query(
      `SELECT 1 FROM contacts c JOIN forum_posts fp ON fp.user_id = c.user_id
       WHERE c.normalized_email = lower(trim($1)) LIMIT 1`,
      [recipientEmail],
    );
    return (result.rowCount ?? 0) > 0;
  }
  if (!courseId) return false;
  if (goal === "course_pro") {
    const result = await pool.query(
      `SELECT 1 FROM contacts c JOIN course_enrollments ce ON ce.user_id = c.user_id
       WHERE c.normalized_email = lower(trim($1)) AND ce.course_id = $2 AND ce.tier = 'pro' LIMIT 1`,
      [recipientEmail, courseId],
    );
    return (result.rowCount ?? 0) > 0;
  }
  const result = await pool.query(
    `SELECT COUNT(l.id)::int AS total, COUNT(lp.lesson_id)::int AS completed
     FROM contacts c
     JOIN course_enrollments ce ON ce.user_id = c.user_id AND ce.course_id = $2
     JOIN course_modules m ON m.course_id = ce.course_id AND (ce.tier = 'pro' OR m.tier = 'free')
     JOIN course_lessons l ON l.module_id = m.id
     LEFT JOIN lesson_progress lp ON lp.user_id = ce.user_id AND lp.lesson_id = l.id
     WHERE c.normalized_email = lower(trim($1))`,
    [recipientEmail, courseId],
  );
  const row = result.rows[0];
  return Number(row?.total || 0) > 0 && Number(row.completed) >= Number(row.total);
}

/** A trigger chooses who enters. An optional saved segment narrows entry.
 * Delays are cumulative, so each wait starts after the previous email. */
export async function triggerEmailFlow(
  triggerKey: EmailTriggerKey,
  recipientEmail: string,
  vars: Record<string, string> = {},
  courseId?: number,
  eventKey?: string,
): Promise<void> {
  try {
    const normalizedEmail = recipientEmail.trim().toLowerCase();
    const contactId = await ensureContact({ email: normalizedEmail });
    const contact = await pool.query<{ name: string | null; email: string; phone: string | null }>(
      "SELECT name, email, phone FROM contacts WHERE id = $1",
      [contactId],
    );
    const resolvedVars = { ...contactMessageValues(contact.rows[0] || { email: normalizedEmail }), ...vars };
    const flows = await pool.query(
      `SELECT f.id, f.purpose, f.entry_segment_id, f.goal_type, f.visual_workflow_id
       FROM email_flows f LEFT JOIN automation_workflows w ON w.id=f.visual_workflow_id
       WHERE f.trigger_key = $1 AND f.active = true AND f.archived_at IS NULL
         AND f.course_id IS NOT DISTINCT FROM $2`,
      [triggerKey, courseId ?? null],
    );
    for (const flow of flows.rows) {
      if (flow.visual_workflow_id) continue;
      if (flow.entry_segment_id && !(await contactMatchesSegment(contactId, Number(flow.entry_segment_id)))) continue;
      if (flow.purpose === "marketing") {
        const consent = await pool.query(
          `SELECT 1 FROM contacts c WHERE c.id = $1 AND c.marketing_status = 'subscribed'
             AND c.deliverability_status = 'ok'
             AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE lower(trim(es.email)) = c.normalized_email)`,
          [contactId],
        );
        if (!consent.rowCount) continue;
      }
      if (await automationGoalReached(flow.goal_type, normalizedEmail, courseId ?? null)) continue;
      const stableEventKey = eventKey || `${triggerKey}:${courseId ?? "global"}:${normalizedEmail}`;
      const run = await pool.query(
        `INSERT INTO email_flow_runs (flow_id, contact_id, recipient_email, course_id, event_key, vars)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (flow_id, event_key) DO NOTHING RETURNING id`,
        [flow.id, contactId, normalizedEmail, courseId ?? null, stableEventKey, JSON.stringify(resolvedVars)],
      );
      if (!run.rows[0]) continue;
      const steps = await pool.query(
        "SELECT id, delay_days FROM email_flow_steps WHERE flow_id = $1 AND archived_at IS NULL ORDER BY position, id",
        [flow.id],
      );
      let cumulativeDays = 0;
      for (const step of steps.rows) {
        cumulativeDays += Number(step.delay_days);
        await pool.query(
          `INSERT INTO email_flow_scheduled (step_id, run_id, recipient_email, vars, send_at)
           VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
          [step.id, run.rows[0].id, normalizedEmail, JSON.stringify(resolvedVars), cumulativeDays],
        );
      }
    }
  } catch (error) {
    console.error("Email automation trigger failed (non-fatal):", error);
  }
}

/** Maintain one inactivity journey per enrollment. Lesson counts respect the
 * learner's tier; completing all accessible lessons cancels pending mail. */
export async function emitCourseInactivityEvents(): Promise<number> {
  const enrollments = await pool.query(
    `SELECT ce.id AS enrollment_id, ce.user_id, ce.tier, u.email, u.name, c.id AS course_id, c.slug, c.title,
            COUNT(DISTINCT l.id)::int AS total_lessons,
            COUNT(DISTINCT lp.lesson_id)::int AS completed_lessons,
            GREATEST(ce.created_at, u.email_verified_at, COALESCE(MAX(lp.completed_at), ce.created_at)) AS last_active_at,
            (SELECT m.title FROM course_lessons nl JOIN course_modules m ON m.id = nl.module_id
             WHERE m.course_id = c.id AND (ce.tier = 'pro' OR m.tier = 'free')
               AND NOT EXISTS (SELECT 1 FROM lesson_progress nlp WHERE nlp.lesson_id = nl.id AND nlp.user_id = ce.user_id)
             ORDER BY m.position, nl.position LIMIT 1) AS current_module,
            (SELECT nl.title FROM course_lessons nl JOIN course_modules m ON m.id = nl.module_id
             WHERE m.course_id = c.id AND (ce.tier = 'pro' OR m.tier = 'free')
               AND NOT EXISTS (SELECT 1 FROM lesson_progress nlp WHERE nlp.lesson_id = nl.id AND nlp.user_id = ce.user_id)
             ORDER BY m.position, nl.position LIMIT 1) AS current_lesson
     FROM course_enrollments ce
     JOIN users u ON u.id = ce.user_id
     JOIN courses c ON c.id = ce.course_id
     LEFT JOIN course_modules m ON m.course_id = c.id AND (ce.tier = 'pro' OR m.tier = 'free')
     LEFT JOIN course_lessons l ON l.module_id = m.id
     LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ce.user_id
     WHERE u.email_verified_at IS NOT NULL
     GROUP BY ce.id, ce.user_id, u.email, u.name, u.email_verified_at, c.id, c.slug, c.title
     HAVING COUNT(DISTINCT l.id) > 0 AND COUNT(DISTINCT lp.lesson_id) < COUNT(DISTINCT l.id)`
  );
  let emitted = 0;
  for (const enrollment of enrollments.rows) {
    try {
      const lastActiveAt = new Date(enrollment.last_active_at);
      await emitWebhookEvent({
        eventType: "course.inactivity",
        source: "course_inactivity",
        sourceRecordId: `${enrollment.enrollment_id}:${lastActiveAt.toISOString()}`,
        occurredAt: lastActiveAt,
        contactEmail: enrollment.email,
        contactName: enrollment.name,
        userId: Number(enrollment.user_id),
        data: {
          enrollment_id: enrollment.enrollment_id,
          course_id: enrollment.course_id,
          course_slug: enrollment.slug,
          course_title: enrollment.title,
          last_active_at: lastActiveAt.toISOString(),
          completed_lessons: Number(enrollment.completed_lessons),
          total_lessons: Number(enrollment.total_lessons),
          current_module: enrollment.current_module || "",
          current_lesson: enrollment.current_lesson || "",
        },
      });
      emitted++;
    } catch (error) {
      console.error("Failed to emit course.inactivity workflow event:", error);
    }
  }
  return emitted;
}

export async function syncCourseInactivityFlows(): Promise<number> {
  let scheduledCount = 0;
  try {
    const visualWorkflow = await pool.query(
      "SELECT 1 FROM automation_workflows WHERE trigger_type = 'event' AND trigger_key = 'course.inactivity' AND status = 'active' AND archived_at IS NULL LIMIT 1",
    );
    if (visualWorkflow.rowCount) {
      // Let already-queued legacy messages finish. The shared visual workflow
      // takes new inactivity events, and the event queue filters learners
      // with an outstanding legacy run until that run has drained.
      await pool.query(
        `UPDATE email_flows f SET active = false, paused_by_visual_workflow = true
         WHERE f.trigger_key = 'course_inactivity' AND f.active = true AND f.archived_at IS NULL AND f.visual_workflow_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM email_flow_scheduled s JOIN email_flow_steps st ON st.id = s.step_id
             WHERE st.flow_id = f.id AND s.status = 'pending'
           )
           AND NOT EXISTS (SELECT 1 FROM email_flow_runs r WHERE r.flow_id = f.id AND r.status = 'active')`,
      );
      return 0;
    }

    // If the shared visual workflow was paused, restore only the legacy
    // journeys that it itself paused; manually paused journeys stay paused.
    await pool.query(
      "UPDATE email_flows SET active = true, paused_by_visual_workflow = false WHERE trigger_key = 'course_inactivity' AND paused_by_visual_workflow = true AND visual_workflow_id IS NULL AND archived_at IS NULL",
    );
    const flows = await pool.query(
      `SELECT id, course_id FROM email_flows
       WHERE trigger_key = 'course_inactivity' AND active = true AND visual_workflow_id IS NULL AND archived_at IS NULL`,
    );
    for (const flow of flows.rows) {
      const steps = await pool.query(
        "SELECT id, delay_days FROM email_flow_steps WHERE flow_id = $1 AND archived_at IS NULL ORDER BY position, id",
        [flow.id],
      );
      if (!steps.rows.length) continue;
      const enrollments = await pool.query(
        `SELECT ce.id AS enrollment_id, ce.user_id, u.email, u.name, c.id AS course_id, c.slug, c.title,
                COUNT(DISTINCT l.id)::int AS total_lessons,
                COUNT(DISTINCT lp.lesson_id)::int AS completed_lessons,
                GREATEST(ce.created_at, u.email_verified_at, COALESCE(MAX(lp.completed_at), ce.created_at)) AS last_active_at
         FROM course_enrollments ce
         JOIN users u ON u.id = ce.user_id JOIN courses c ON c.id = ce.course_id
         LEFT JOIN course_modules m ON m.course_id = c.id AND (ce.tier = 'pro' OR m.tier = 'free')
         LEFT JOIN course_lessons l ON l.module_id = m.id
         LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ce.user_id
         -- Accounts nobody has activated yet can't log in, so nudging them is
         -- pointless. Their clock starts when they activate.
         WHERE ce.course_id = $1 AND u.email_verified_at IS NOT NULL
         GROUP BY ce.id, u.email, u.name, u.email_verified_at, c.id, c.slug, c.title`,
        [flow.course_id],
      );
      for (const enr of enrollments.rows) {
        const eventKey = `inactivity:${enr.enrollment_id}`;
        if (Number(enr.total_lessons) === 0 || Number(enr.completed_lessons) >= Number(enr.total_lessons)) {
          await pool.query(
            `UPDATE email_flow_scheduled s SET status = 'skipped', skipped_reason = 'Course completed'
             FROM email_flow_runs r WHERE s.run_id = r.id AND r.flow_id = $1 AND r.event_key = $2 AND s.status = 'pending'`,
            [flow.id, eventKey],
          );
          await pool.query(
            `UPDATE email_flow_runs SET status = 'exited', exit_reason = 'course_completed', finished_at = now()
             WHERE flow_id = $1 AND event_key = $2 AND status = 'active'`,
            [flow.id, eventKey],
          );
          continue;
        }
        const curriculum = await pool.query(
          `SELECT l.title AS lesson_title, m.title AS module_title FROM course_lessons l
           JOIN course_modules m ON m.id = l.module_id
           JOIN course_enrollments ce ON ce.user_id = $2 AND ce.course_id = m.course_id
           WHERE m.course_id = $1 AND (ce.tier = 'pro' OR m.tier = 'free')
             AND NOT EXISTS (SELECT 1 FROM lesson_progress lp WHERE lp.lesson_id = l.id AND lp.user_id = $2)
           ORDER BY m.position, l.position LIMIT 1`,
          [enr.course_id, enr.user_id],
        );
        const nextLesson = curriculum.rows[0];
        const vars: Record<string, string> = {
          ...contactMessageValues({ name: enr.name, email: enr.email }),
          course_title: enr.title,
          course_url: `${SITE_URL}/account/courses/${enr.slug}`,
          completed_lessons: String(enr.completed_lessons), total_lessons: String(enr.total_lessons),
          current_module: nextLesson?.module_title || "", current_lesson: nextLesson?.lesson_title || "",
        };
        const contactId = await ensureContact({ email: enr.email, name: enr.name, userId: enr.user_id });
        let run = await pool.query("SELECT id FROM email_flow_runs WHERE flow_id = $1 AND event_key = $2 LIMIT 1", [flow.id, eventKey]);
        if (!run.rows[0]) {
          run = await pool.query(
            `INSERT INTO email_flow_runs (flow_id, contact_id, recipient_email, course_id, event_key, vars)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [flow.id, contactId, enr.email.toLowerCase(), enr.course_id, eventKey, JSON.stringify(vars)],
          );
        } else {
          await pool.query("UPDATE email_flow_runs SET vars = $2 WHERE id = $1", [run.rows[0].id, JSON.stringify(vars)]);
        }
        let cumulativeDays = 0;
        const lastActive = new Date(enr.last_active_at).getTime();
        for (const step of steps.rows) {
          cumulativeDays += Number(step.delay_days);
          const sendAt = new Date(lastActive + cumulativeDays * 86400000);
          const existing = await pool.query(
            "SELECT id, status FROM email_flow_scheduled WHERE run_id = $1 AND step_id = $2 LIMIT 1",
            [run.rows[0].id, step.id],
          );
          if (!existing.rows[0]) {
            await pool.query(
              `INSERT INTO email_flow_scheduled (step_id, run_id, recipient_email, vars, send_at)
               VALUES ($1, $2, $3, $4, $5)`,
              [step.id, run.rows[0].id, enr.email.toLowerCase(), JSON.stringify(vars), sendAt],
            );
            scheduledCount++;
          } else if (existing.rows[0].status === "pending") {
            await pool.query("UPDATE email_flow_scheduled SET send_at = $2, vars = $3 WHERE id = $1", [existing.rows[0].id, sendAt, JSON.stringify(vars)]);
          }
        }
      }
    }
  } catch (error) {
    console.error("Course inactivity synchronization failed (non-fatal):", error);
  }
  return scheduledCount;
}

/** Schedule the editable first-post journey for active community members.
 * The exit goal is rechecked at dispatch, so posting after scheduling stops it. */
async function emitCommunityInactivityWorkflowEvents(): Promise<void> {
  const active = await pool.query("SELECT 1 FROM automation_workflows WHERE trigger_type='event' AND trigger_key='community.member_inactive' AND status='active' AND archived_at IS NULL LIMIT 1");
  if (!active.rowCount) return;
  const members = await pool.query(
    `SELECT cm.id AS membership_id, cm.created_at, u.id AS user_id, u.email, u.name
     FROM community_memberships cm JOIN users u ON u.id=cm.user_id
     WHERE cm.status='active' AND NOT EXISTS (SELECT 1 FROM forum_posts fp WHERE fp.user_id=u.id)`
  );
  for (const member of members.rows) {
    await emitWebhookEvent({
      eventType: "community.member_inactive", source: "community_memberships",
      sourceRecordId: member.membership_id, occurredAt: member.created_at,
      contactEmail: member.email, contactName: member.name, userId: member.user_id,
      data: { membership_id: member.membership_id, email: member.email, name: member.name, community_url: `${SITE_URL}/community` },
    }).catch((error) => console.error("Community inactivity workflow event failed:", error));
  }
}

export async function syncCommunityInactivityFlows(): Promise<number> {
  let scheduledCount = 0;
  try {
    await emitCommunityInactivityWorkflowEvents();
    const flows = await pool.query(
      `SELECT id FROM email_flows
       WHERE trigger_key = 'community_inactivity' AND active = true AND visual_workflow_id IS NULL AND archived_at IS NULL`,
    );
    for (const flow of flows.rows) {
      const steps = await pool.query(
        "SELECT id, delay_days FROM email_flow_steps WHERE flow_id = $1 AND archived_at IS NULL ORDER BY position, id",
        [flow.id],
      );
      const members = await pool.query(
        `SELECT cm.id AS membership_id, cm.created_at, u.id AS user_id, u.email, u.name,
                EXISTS (SELECT 1 FROM forum_posts fp WHERE fp.user_id = u.id) AS has_post
         FROM community_memberships cm JOIN users u ON u.id = cm.user_id
         WHERE cm.status = 'active'`,
      );
      for (const member of members.rows) {
        const eventKey = `community-first-post:${member.membership_id}`;
        const existingRun = await pool.query(
          "SELECT id FROM email_flow_runs WHERE flow_id = $1 AND event_key = $2 LIMIT 1",
          [flow.id, eventKey],
        );
        if (member.has_post) {
          if (existingRun.rows[0]) {
            await pool.query(
              "UPDATE email_flow_scheduled SET status = 'skipped', skipped_reason = 'First community post created' WHERE run_id = $1 AND status = 'pending'",
              [existingRun.rows[0].id],
            );
            await pool.query(
              "UPDATE email_flow_runs SET status = 'exited', exit_reason = 'community_first_post', finished_at = now() WHERE id = $1 AND status = 'active'",
              [existingRun.rows[0].id],
            );
          }
          continue;
        }
        const vars = {
          ...contactMessageValues({ name: member.name, email: member.email }),
          community_url: `${SITE_URL}/community`,
        };
        let run = existingRun;
        if (!run.rows[0]) {
          const contactId = await ensureContact({ email: member.email, name: member.name, userId: member.user_id });
          run = await pool.query(
            `INSERT INTO email_flow_runs (flow_id, contact_id, recipient_email, event_key, vars)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [flow.id, contactId, member.email.toLowerCase(), eventKey, JSON.stringify(vars)],
          );
        }
        let cumulativeDays = 0;
        for (const step of steps.rows) {
          cumulativeDays += Number(step.delay_days);
          const sendAt = new Date(new Date(member.created_at).getTime() + cumulativeDays * 86400000);
          const scheduled = await pool.query(
            "SELECT 1 FROM email_flow_scheduled WHERE run_id = $1 AND step_id = $2 LIMIT 1",
            [run.rows[0].id, step.id],
          );
          if (!scheduled.rowCount) {
            await pool.query(
              `INSERT INTO email_flow_scheduled (step_id, run_id, recipient_email, vars, send_at)
               VALUES ($1, $2, $3, $4, $5)`,
              [step.id, run.rows[0].id, member.email.toLowerCase(), JSON.stringify(vars), sendAt],
            );
            scheduledCount++;
          }
        }
      }
    }
  } catch (error) {
    console.error("Community inactivity synchronization failed (non-fatal):", error);
  }
  return scheduledCount;
}

export { applyVars };
