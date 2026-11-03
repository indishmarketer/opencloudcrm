import { z } from "zod";

export const WEBINAR_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type WebinarAgendaItem = { title: string; description: string };

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalSiteUrl = z.string().trim().max(2_000).refine(
  (value) => !value || value.startsWith("/") || /^https:\/\//i.test(value),
  "Use a site path or HTTPS URL.",
).nullable().optional();

const webinarFields = {
  title: z.string().trim().min(1).max(300),
  slug: z.string().trim().min(1).max(200).regex(WEBINAR_SLUG_PATTERN),
  subtitle: nullableText(500),
  description: nullableText(10_000),
  thumbnail_url: optionalSiteUrl,
  presenter_name: nullableText(200),
  presenter_title: nullableText(300),
  presenter_bio: nullableText(5_000),
  presenter_image_url: optionalSiteUrl,
  audience: nullableText(5_000),
  key_takeaways: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
  agenda: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(1_000).default(""),
  })).max(20).optional(),
  cta_label: nullableText(120),
  cta_url: optionalSiteUrl,
  seo_title: nullableText(70),
  seo_description: nullableText(170),
  featured: z.boolean().optional(),
  access_tier: z.enum(["free", "pro"]).optional(),
  requires_registration: z.boolean().optional(),
  release_at: z.string().trim().nullable().optional(),
};

export const webinarCreateSchema = z.object(webinarFields);
// .partial() (not a hand-rolled Object.fromEntries remap) so TypeScript
// keeps every field's literal key/type instead of widening the whole
// object to a generic string-indexed type.
export const webinarUpdateSchema = webinarCreateSchema.partial().extend({
  status: z.enum(["draft", "processing", "ready", "errored", "published", "archived"]).optional(),
});

export type WebinarReadinessRecord = {
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  presenter_name?: string | null;
  key_takeaways?: unknown;
  mux_playback_id?: string | null;
  active_schedule_count?: number | string | null;
};

export function getWebinarReadiness(webinar: WebinarReadinessRecord): string[] {
  const issues: string[] = [];
  if (!webinar.title?.trim()) issues.push("Add a title");
  if (!webinar.description?.trim()) issues.push("Add a clear description");
  if (!webinar.thumbnail_url?.trim()) issues.push("Upload a thumbnail");
  if (!webinar.presenter_name?.trim()) issues.push("Add the presenter");
  if (!Array.isArray(webinar.key_takeaways) || webinar.key_takeaways.length < 3) issues.push("Add at least 3 takeaways");
  if (!webinar.mux_playback_id?.trim()) issues.push("Upload a processed video");
  if (Number(webinar.active_schedule_count || 0) < 1) issues.push("Add an active broadcast schedule");
  return issues;
}

export function parseReleaseAt(value: string | null | undefined): Date | null {
  if (!value || !String(value).trim()) return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

export function validationMessage(error: z.ZodError): string {
  return error.issues[0]?.message || "Invalid request.";
}
