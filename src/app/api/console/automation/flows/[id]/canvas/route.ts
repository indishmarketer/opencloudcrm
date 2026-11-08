import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";
import { EMAIL_TRIGGERS } from "@/lib/emailAutomation";
import { emailAt } from "@/lib/liveSiteUrl";

type RouteContext = { params: Promise<{ id: string }> };

function positiveId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const flowId = positiveId((await params).id);
  if (!flowId) return NextResponse.json({ error: "Email journey not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray(body.graph?.nodes) || !Array.isArray(body.graph?.edges)) {
    return NextResponse.json({ error: "Provide a valid workflow canvas." }, { status: 400 });
  }

  const flowResult = await pool.query(
    "SELECT id FROM email_flows WHERE id = $1 AND archived_at IS NULL", [flowId],
  );
  if (!flowResult.rowCount) return NextResponse.json({ error: "Email journey not found." }, { status: 404 });

  const nodes = body.graph.nodes as Array<{ id: string; data?: { kind?: string; config?: Record<string, unknown> } }>;
  const edges = body.graph.edges as Array<{ source: string; target: string }>;
  const triggers = nodes.filter((node) => node.data?.kind === "trigger");
  const steps = nodes.filter((node) => node.data?.kind === "email");
  const waits = nodes.filter((node) => node.data?.kind === "wait");
  if (triggers.length !== 1 || triggers[0].id === undefined || nodes.length !== steps.length + waits.length + 1) {
    return NextResponse.json({ error: "Email journeys need one trigger, wait steps, and email or review action nodes." }, { status: 400 });
  }
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
  }
  if (edges.length !== steps.length + waits.length || [...steps, ...waits].some((step) => incoming.get(step.id) !== 1) || [...outgoing.values()].some((targets) => targets.length > 1)) {
    return NextResponse.json({ error: "Connect the journey as one ordered path from the trigger." }, { status: 400 });
  }
  const ordered: typeof nodes = [];
  let cursor = triggers[0].id;
  const visited = new Set<string>([cursor]);
  while ((outgoing.get(cursor) || []).length) {
    cursor = outgoing.get(cursor)![0];
    const step = [...steps, ...waits].find((item) => item.id === cursor);
    if (!step || visited.has(cursor)) return NextResponse.json({ error: "The journey path contains an invalid connection or loop." }, { status: 400 });
    visited.add(cursor);
    ordered.push(step);
  }
  if (ordered.length !== steps.length + waits.length) return NextResponse.json({ error: "Connect every journey step to the path." }, { status: 400 });
  if (body.active && !steps.length) return NextResponse.json({ error: "Add at least one action before activating this journey." }, { status: 400 });

  const triggerKey = String(body.triggerKey || "");
  const trigger = EMAIL_TRIGGERS.find((item) => item.key === triggerKey);
  if (!trigger) return NextResponse.json({ error: "Choose a supported email journey trigger." }, { status: 400 });
  const courseId = trigger.courseScoped ? positiveId(String(body.courseId || "")) : null;
  if (trigger.courseScoped && !courseId) return NextResponse.json({ error: "Choose a course for this trigger." }, { status: 400 });
  const purpose = body.purpose === "marketing" ? "marketing" : "service";
  const allowedGoals = ["none", "course_pro", "course_completed", "community_first_post"];
  const goalType = allowedGoals.includes(body.goalType) ? body.goalType : "none";
  const entrySegmentId = body.entrySegmentId ? positiveId(String(body.entrySegmentId)) : null;
  const validSenders = new Set([emailAt("me"), emailAt("support"), emailAt("reach"), emailAt("academy")]);
  const validConditions = new Set(["always", "opened", "not_opened", "clicked", "not_clicked"]);

  try {
    const saved = await withTransaction(async (client) => {
      const existing = await client.query<{ id: number }>(
        "SELECT id FROM email_flow_steps WHERE flow_id = $1 AND archived_at IS NULL ORDER BY position, id FOR UPDATE", [flowId],
      );
      const existingIds = new Set(existing.rows.map((row) => Number(row.id)));
      const stepIds = new Map<string, number>();
      const orderedSteps = ordered.filter((node) => node.data?.kind === "email");
      let pendingDelayDays = 0;
      let emailPosition = 0;

      for (const node of ordered) {
        const config = node.data?.config || {};
        if (node.data?.kind === "wait") {
          const duration = Math.floor(Number(config.duration));
          if (config.unit !== "days" || !Number.isFinite(duration) || duration < 1 || duration > 365 || pendingDelayDays + duration > 365) {
            throw new Error("Wait steps must use whole days, with no more than 365 days before an action.");
          }
          pendingDelayDays += duration;
          continue;
        }
        const parsedStepId = positiveId(String(config.stepId || ""));
        const stepId = parsedStepId && existingIds.has(parsedStepId) ? parsedStepId : null;
        const delayDays = pendingDelayDays;
        pendingDelayDays = 0;
        const position = emailPosition++;
        const fromEmailValue = String(config.fromEmail || emailAt("academy")).trim();
        const fromEmail = validSenders.has(fromEmailValue) ? fromEmailValue : emailAt("academy");
        const actionType = config.actionType === "google_review_request" ? "google_review_request" : "email";
        const reviewTemplateKey = config.reviewTemplateKey === "google-review-reminder" ? config.reviewTemplateKey : "google-review-request";
        const subject = String(config.subject || "").slice(0, 300);
        const bodyHtml = String(config.bodyHtml || "");

        if (stepId) {
          await client.query(
            `UPDATE email_flow_steps SET position = $2, delay_days = $3, from_email = $4, subject = $5, body_html = $6,
             action_type = $7, review_template_key = $8, archived_at = NULL WHERE id = $1 AND flow_id = $9`,
            [stepId, position, delayDays, fromEmail, subject, bodyHtml, actionType, actionType === "google_review_request" ? reviewTemplateKey : null, flowId],
          );
        } else {
          const inserted = await client.query<{ id: number }>(
            `INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html, action_type, review_template_key)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [flowId, position, delayDays, fromEmail, subject, bodyHtml, actionType, actionType === "google_review_request" ? reviewTemplateKey : null],
          );
          stepIds.set(node.id, Number(inserted.rows[0].id));
        }
        if (stepId) stepIds.set(node.id, stepId);
      }
      if (pendingDelayDays > 0) throw new Error("A wait step must be followed by an email or review action.");

      const activeIds = [...stepIds.values()];
      const removedIds = [...existingIds].filter((id) => !activeIds.includes(id));
      if (removedIds.length) {
        await client.query(
          "UPDATE email_flow_scheduled SET status = 'skipped', claimed_at = NULL, skipped_reason = 'Journey step removed in workflow editor' WHERE step_id = ANY($1::int[]) AND status = 'pending'",
          [removedIds],
        );
        await client.query("UPDATE email_flow_steps SET archived_at = now() WHERE id = ANY($1::int[]) AND flow_id = $2", [removedIds, flowId]);
      }

      for (const [position, node] of orderedSteps.entries()) {
        const config = node.data?.config || {};
        const conditionType = validConditions.has(String(config.conditionType)) ? String(config.conditionType) : "always";
        const refNodeId = typeof config.conditionStepNodeId === "string" ? config.conditionStepNodeId : "";
        const conditionStepId = conditionType !== "always" ? stepIds.get(refNodeId) || null : null;
        const earlier = conditionStepId && orderedSteps.slice(0, position).some((previous) => stepIds.get(previous.id) === conditionStepId);
        await client.query(
          "UPDATE email_flow_steps SET condition_type = $2, condition_step_id = $3 WHERE id = $1",
          [stepIds.get(node.id), conditionType !== "always" && earlier ? conditionType : "always", conditionType !== "always" && earlier ? conditionStepId : null],
        );
      }

      if (entrySegmentId) {
        const segment = await client.query("SELECT 1 FROM contact_segments WHERE id = $1", [entrySegmentId]);
        if (!segment.rowCount) throw new Error("Choose a valid entry segment.");
      }
      if (trigger.courseScoped) {
        const course = await client.query("SELECT 1 FROM courses WHERE id = $1", [courseId]);
        if (!course.rowCount) throw new Error("Choose a valid course.");
      }
      const flow = await client.query(
        `UPDATE email_flows SET name = $2, active = $3, trigger_key = $4, course_id = $5, purpose = $6,
         entry_segment_id = $7, goal_type = $8 WHERE id = $1 AND archived_at IS NULL RETURNING id`,
        [flowId, String(body.name || "Untitled workflow").trim().slice(0, 200) || "Untitled workflow", !!body.active, triggerKey, courseId, purpose, entrySegmentId, goalType],
      );
      return flow.rowCount === 1;
    });
    if (!saved) return NextResponse.json({ error: "Email journey not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save this email journey." }, { status: 400 });
  }
}
