import type { PageBlock } from "@/lib/pageBlocks";
import { DEFAULT_DIRECTORY_HERO, directoryHeroFromBlocks } from "@/lib/directoryPageHero";
import { escapeHtml } from "@/lib/escapeHtml";

const element = (id: string, type: string, props: Record<string, unknown>): PageBlock => ({ id, type, props });
const paragraph = (id: string, value: string, props: Record<string, unknown> = {}) =>
  element(id, "richText", { html: `<p>${escapeHtml(value)}</p>`, width: "wide", ...props });

/** The directory's initial layout uses the same section and element types as any other page. */
export function directoryPageBlocks(legacy?: PageBlock): PageBlock[] {
  const hero = legacy ? directoryHeroFromBlocks([legacy]) : DEFAULT_DIRECTORY_HERO;
  const description = hero.text.replaceAll("{{count}} ", "");
  const note = hero.listingNote.replaceAll("{{price}}", "the current listing fee");
  const headingLevel = hero.headingTag === "p" ? "h2" : hero.headingTag;
  const eyebrow = hero.eyebrowTag === "p"
    ? paragraph("tools-eyebrow", hero.eyebrow.toUpperCase(), { textColor: "#a3a3a3", textAlign: "center", fontSize: 14, fontWeight: "bold", paddingY: 0, paddingX: 0 })
    : element("tools-eyebrow", "heading", { text: hero.eyebrow, level: hero.eyebrowTag, textColor: "#a3a3a3", textAlign: "center", fontSize: 14, fontWeight: "bold", paddingY: 0, paddingX: 0 });
  return [
    element("tools-hero", "row", {
      columns: "1", gap: "sm", paddingY: 88, paddingX: 32, maxWidth: 1380, sectionWidth: "contained",
      backgroundColor: "#0b0b0b", backgroundPattern: "grid", patternColor: "#242424", borderRadius: 28, items: [[
        eyebrow,
        element("tools-headline", "heading", { text: hero.heading, level: headingLevel, textAlign: "center", textColor: "#ffffff", fontSize: 60, fontWeight: "bold", paddingY: 0, paddingX: 0 }),
        paragraph("tools-description", description, { textAlign: "center", textColor: "#b9b9b9", fontSize: 20, paddingY: 0, paddingX: 0 }),
        element("tools-search", "directorySearch", { placeholder: hero.searchPlaceholder, submitLabel: hero.submitLabel }),
        paragraph("tools-listing-note", note, { textAlign: "center", textColor: "#999999", fontSize: 13, paddingY: 0, paddingX: 0 }),
        element("tools-logos", "directoryLogos", {}),
      ]],
    }),
    element("tools-results", "directoryResults", { paddingY: 48, paddingX: 24, maxWidth: 1152 }),
    element("tools-categories", "row", {
      columns: "1", gap: "sm", paddingY: 40, paddingX: 24, maxWidth: 1152,
      items: [[
        element("tools-categories-heading", "heading", { text: hero.categoriesHeading, level: "h2", fontSize: 24, fontWeight: "semibold", paddingX: 0 }),
        element("tools-categories-list", "directoryCategories", {}),
      ]],
    }),
  ];
}

/** Old published and draft pages are converted without discarding their other sections. */
export function upgradeDirectoryBlocks(blocks: PageBlock[]): PageBlock[] {
  if (!blocks.some((block) => block.type === "builtIn")) return blocks;
  return blocks.flatMap((block) => block.type === "builtIn" ? directoryPageBlocks(block) : [block]);
}
