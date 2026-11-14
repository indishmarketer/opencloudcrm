import type { PageBlock } from "@/lib/pageBlocks";

export type DirectoryPageHero = {
  eyebrow: string;
  eyebrowTag: "p" | "h1" | "h2" | "h3";
  heading: string;
  headingTag: "p" | "h1" | "h2" | "h3";
  text: string;
  searchPlaceholder: string;
  submitLabel: string;
  listingNote: string;
  categoriesHeading: string;
};

export const DEFAULT_DIRECTORY_HERO: DirectoryPageHero = {
  eyebrow: "Tools & software directory",
  eyebrowTag: "p",
  heading: "Find the tool that does the job",
  headingTag: "h1",
  text: "{{count}} AI agents, automations, CRMs and open source tools we have vetted or built with. Search by what you need, filter by category and price. No pay-to-rank listings.",
  searchPlaceholder: "Search 'CRM', 'free API', 'email tool'...",
  submitLabel: "Submit your tool",
  listingNote: "Free listing with our badge on your site, or {{price}} for a reviewed listing with no badge. Every link is nofollow, both ways.",
  categoriesHeading: "Categories",
};

export function directoryHeroFromBlocks(blocks: PageBlock[]): DirectoryPageHero {
  const props = blocks.find((block) => block.type === "builtIn")?.props || {};
  const field = (key: keyof DirectoryPageHero) => {
    const value = props[key];
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_DIRECTORY_HERO[key];
  };
  return {
    eyebrow: field("eyebrow"),
    eyebrowTag: headingTag(props.eyebrowTag, DEFAULT_DIRECTORY_HERO.eyebrowTag),
    heading: field("heading"),
    headingTag: headingTag(props.headingTag, DEFAULT_DIRECTORY_HERO.headingTag),
    text: field("text"),
    searchPlaceholder: field("searchPlaceholder"),
    submitLabel: field("submitLabel"),
    listingNote: field("listingNote"),
    categoriesHeading: field("categoriesHeading"),
  };
}

function headingTag(value: unknown, fallback: DirectoryPageHero["headingTag"]): DirectoryPageHero["headingTag"] {
  return value === "p" || value === "h1" || value === "h2" || value === "h3" ? value : fallback;
}

export function directoryHeroText(text: string, count: number): string {
  return text.replaceAll("{{count}}", String(count));
}

export function directoryListingNote(text: string, priceLabel: string): string {
  return text.replaceAll("{{price}}", priceLabel);
}
