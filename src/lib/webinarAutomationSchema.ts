import { z } from "zod";
function isValidTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); return true; } catch { return false; }
}

const databaseId = z.coerce.number().int().positive();

const scheduleSchema = z.object({
  id: databaseId.optional(),
  schedule_kind: z.enum(["weekly", "specific"]),
  timezone: z.string().trim().min(1).max(100),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  specific_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  local_time: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/),
  active: z.boolean().default(true),
}).strict().superRefine((value, ctx) => {
  if (!isValidTimeZone(value.timezone)) ctx.addIssue({ code: "custom", path: ["timezone"], message: "Invalid timezone." });
  if (value.schedule_kind === "weekly" && value.weekdays.length === 0) ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Choose at least one day." });
  if (value.schedule_kind === "specific" && !value.specific_date) ctx.addIssue({ code: "custom", path: ["specific_date"], message: "Choose a date." });
});

const eventSchema = z.object({
  id: databaseId.optional(), event_type: z.enum(["quiz", "cta", "question"]),
  trigger_seconds: z.number().int().min(0).max(86400), title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(1000).nullable(), options: z.array(z.string().trim().min(1).max(300)).max(10),
  correct_option: z.number().int().min(0).nullable(), cta_label: z.string().trim().max(100).nullable(),
  cta_url: z.string().trim().url().max(2000).nullable(), response_type: z.enum(["choice", "text"]).nullable(),
  display_mode: z.enum(["popup", "qa", "both"]), active: z.boolean().default(true),
}).strict().superRefine((value, ctx) => {
  if (value.event_type === "quiz") {
    if (value.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two answers." });
    if (value.correct_option !== null && value.correct_option >= value.options.length) ctx.addIssue({ code: "custom", path: ["correct_option"], message: "Choose a valid correct answer." });
  } else if (value.event_type === "cta") {
    if (!value.cta_label || !value.cta_url) ctx.addIssue({ code: "custom", path: ["cta_url"], message: "CTA label and URL are required." });
  } else {
    if (value.response_type === null) ctx.addIssue({ code: "custom", path: ["response_type"], message: "Choose multiple choice or free text." });
    if (value.response_type === "choice" && value.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two answers." });
  }
});

export const webinarAutomationBodySchema = z.object({ schedules: z.array(scheduleSchema).max(30), events: z.array(eventSchema).max(100) }).strict();

const scheduleKeys = ["id", "schedule_kind", "timezone", "weekdays", "specific_date", "local_time", "active"] as const;
const eventKeys = ["id", "event_type", "trigger_seconds", "title", "body", "options", "correct_option", "cta_label", "cta_url", "response_type", "display_mode", "active"] as const;

function pickFields(value: object, keys: readonly string[]): Record<string, unknown> {
  const record = value as Record<string, unknown>;
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]));
}

/** Only send fields the administrator can edit, never PostgreSQL metadata. */
export function webinarAutomationPayload(input: { schedules: object[]; events: object[] }) {
  return {
    schedules: input.schedules.map((item) => pickFields(item, scheduleKeys)),
    events: input.events.map((item) => pickFields(item, eventKeys)),
  };
}
