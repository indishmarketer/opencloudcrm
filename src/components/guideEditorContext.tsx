"use client";

import { createContext, useContext } from "react";

export type GuideEditorPrompt = { id: number; title: string; category_name: string; show_in_library: boolean };
export type GuideEditorSkill = { id: number; title: string; category_name: string; show_in_library: boolean };
export type GuideEditorCategory = { id: number; name: string };

export type GuideStepAttrs = {
  itemType: "prompt" | "skill";
  refId: number | null;
  timestampLabel: string;
  instruction: string;
};

export type NewLibraryItemInput = { title: string; category_id: number; text: string; show_in_library: boolean };

export type GuideEditorContextValue = {
  prompts: GuideEditorPrompt[];
  skills: GuideEditorSkill[];
  categories: GuideEditorCategory[];
  onCreateItem: (itemType: "prompt" | "skill", data: NewLibraryItemInput) => Promise<{ id: number; title: string } | { error: string }>;
  onToggleLibrary: (itemType: "prompt" | "skill", id: number) => Promise<void>;
};

export const GuideEditorContext = createContext<GuideEditorContextValue | null>(null);

export function useGuideEditorContext(): GuideEditorContextValue {
  const ctx = useContext(GuideEditorContext);
  if (!ctx) throw new Error("GuideStepNodeView must render inside GuideRichTextEditor");
  return ctx;
}
