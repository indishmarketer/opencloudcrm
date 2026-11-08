import { z } from "zod";
import { extractYoutubeId } from "@/lib/youtube";

export const COURSE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

export const courseCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).regex(COURSE_SLUG_PATTERN),
});

export const courseUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().min(1).max(200).regex(COURSE_SLUG_PATTERN).optional(),
  subtitle: optionalText(300),
  description: optionalText(10_000),
  cover_image_url: optionalText(2_000),
  price: z.number().int().min(0).max(100_000_000).nullable().optional(),
  price_currency: z.enum(["INR", "USD"]).optional(),
  published: z.boolean().optional(),
});

export const courseModuleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText(2_000),
  tier: z.enum(["free", "pro"]),
  position: z.number().int().min(1).max(10_000),
});

export const courseModuleUpdateSchema = courseModuleSchema.partial();

export const courseLessonSchema = z.object({
  module_id: z.number().int().positive(),
  title: z.string().trim().min(1).max(300),
  description: optionalText(100_000),
  video_type: z.enum(["youtube", "r2"]),
  video_ref: optionalText(2_000),
  position: z.number().int().min(1).max(100_000),
});

export const courseLessonUpdateSchema = courseLessonSchema.omit({ module_id: true, position: true }).partial();

export const courseResourceSchema = z.object({
  lesson_id: z.number().int().positive(),
  label: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2_000).refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
  position: z.number().int().min(1).max(100_000),
});

export const courseResourceUpdateSchema = courseResourceSchema.omit({ lesson_id: true, position: true }).partial();

export const courseReorderSchema = z.object({
  updates: z.array(z.object({
    id: z.number().int().positive(),
    position: z.number().int().min(1).max(100_000),
  })).min(1).max(500),
}).superRefine(({ updates }, context) => {
  if (new Set(updates.map((update) => update.id)).size !== updates.length) {
    context.addIssue({ code: "custom", path: ["updates"], message: "Duplicate ids are not allowed." });
  }
});

export function parsePositiveId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeCourseVideoRef(
  videoType: "youtube" | "r2",
  videoRef: string | null | undefined,
  courseId: number,
  existingRef?: string | null,
): { value: string | null } | { error: string } {
  if (!videoRef?.trim()) return { value: null };
  if (videoType === "youtube") {
    const videoId = extractYoutubeId(videoRef);
    return videoId ? { value: videoId } : { error: "Enter a valid YouTube video ID or URL." };
  }
  const value = videoRef.trim();
  if (value !== existingRef && !new RegExp(`^courses/${courseId}/videos/[A-Za-z0-9._-]+$`).test(value)) {
    return { error: "Select a video from the course media library." };
  }
  return { value };
}

export type PublicationReadinessInput = {
  title: string | null;
  slug: string | null;
  description: string | null;
  coverImageUrl: string | null;
  moduleCount: number;
  lessonCount: number;
  hasProTier: boolean;
  price: number | null;
  missingVideoCount: number;
};

export function evaluateCoursePublicationReadiness(input: PublicationReadinessInput): string[] {
  const issues: string[] = [];
  if (!input.title?.trim()) issues.push("Title is required.");
  if (!input.slug?.trim()) issues.push("Slug is required.");
  if (!input.description?.trim()) issues.push("Description is required.");
  if (!input.coverImageUrl?.trim()) issues.push("Cover image is missing.");
  if (input.moduleCount < 1) issues.push("At least one module is required.");
  if (input.lessonCount < 1) issues.push("At least one lesson is required.");
  if (input.hasProTier && !input.price) {
    issues.push("PRO modules require a price.");
  }
  if (input.missingVideoCount > 0) {
    issues.push(`${input.missingVideoCount} lesson(s) are missing a video reference.`);
  }
  return issues;
}

export function validationMessage(error: z.ZodError): string {
  return error.issues[0]?.message || "Invalid request.";
}
