import { pool } from "@/lib/db";

/** Wakes runs paused on a "Wait until an event" step (see executeRun in
 * workflows.ts) once a matching event happens. A run matches when the
 * event has the same value at the step's link field (e.g. data.tool_id)
 * and, if the step sets one, the extra filter (e.g. data.status equals
 * published). The event is stored as __waitedEvent so later steps can
 * read it as {{waited.…}}; setting wait_until to now hands the run back to
 * the normal dispatcher. */
export async function resumeRunsWaitingForEvent(eventType: string, envelope: Record<string, unknown>): Promise<number> {
  const waiting = await pool.query<{ id: string; node_results: Record<string, unknown> }>(
    `SELECT id, node_results FROM automation_workflow_runs
     WHERE status = 'queued' AND node_results->'__awaitEvent'->>'eventKey' = $1`,
    [eventType],
  );
  let resumed = 0;
  for (const run of waiting.rows) {
    const awaited = run.node_results.__awaitEvent as { nodeId: string; matchField: string; matchValue: string; filterField?: string; filterValue?: string };
    if (String(valueAtPath(envelope, awaited.matchField) ?? "") !== awaited.matchValue) continue;
    if (awaited.filterField && String(valueAtPath(envelope, awaited.filterField) ?? "").toLowerCase() !== String(awaited.filterValue ?? "").toLowerCase()) continue;
    const next = { ...run.node_results, __waitedEvent: envelope, [awaited.nodeId]: { resumedOn: eventType, at: new Date().toISOString() } };
    delete (next as Record<string, unknown>).__awaitEvent;
    // status = 'queued' guards against a dispatcher that already claimed it
    // at the give-up deadline.
    const updated = await pool.query(
      `UPDATE automation_workflow_runs SET node_results = $2::jsonb, wait_until = now()
       WHERE id = $1 AND status = 'queued' AND node_results ? '__awaitEvent'`,
      [run.id, JSON.stringify(next)],
    );
    resumed += updated.rowCount ?? 0;
  }
  return resumed;
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), value);
}
