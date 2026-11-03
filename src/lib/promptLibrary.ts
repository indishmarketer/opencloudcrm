export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type PromptCategory = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export type PromptListItem = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  category_id: number;
  category_slug: string;
  category_name: string;
};

export type SkillListItem = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  skill_markdown: string;
  category_id: number;
  category_slug: string;
  category_name: string;
};

export type PromptGuide = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  video_url: string | null;
  body: string | null;
  status: string;
  item_count: number;
};

export type GuideItem = {
  id: number;
  guide_id: number;
  position: number;
  item_type: "prompt" | "skill";
  prompt_id: number | null;
  skill_id: number | null;
  timestamp_label: string | null;
  instruction: string | null;
  item_title: string;
  item_text: string;
};

export type GuideItemInput = {
  item_type: "prompt" | "skill";
  prompt_id: number | null;
  skill_id: number | null;
  timestamp_label: string | null;
  instruction: string | null;
};

// Steps are authored as nodes inside the guide's own rich-text body now,
// so every guide save carries its current ordered item list alongside the
// body HTML -- this validates that list before it's persisted.
export function parseGuideItemsPayload(raw: unknown): GuideItemInput[] | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    if (item.item_type !== "prompt" && item.item_type !== "skill") return null;
    if (item.item_type === "prompt" && !Number.isInteger(item.prompt_id)) return null;
    if (item.item_type === "skill" && !Number.isInteger(item.skill_id)) return null;
  }
  return raw as GuideItemInput[];
}

export const SKILL_TEMPLATE = `---
name: skill-name
description: One line describing when an agent should reach for this skill.
---

# Skill Name

## When to use this
Describe the trigger condition, what task this skill covers.

## Steps
1. First step.
2. Second step.
3. Third step.

## Notes
Anything an agent following this skill should know: gotchas, constraints, examples.
`;
