// Shared by server routes and client forms, so no server imports here.

export const PRICING_TYPES = ["free", "freemium", "paid", "free_api", "paid_api"] as const;

export const PRICING_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "freemium", label: "Freemium" },
  { value: "paid", label: "Paid" },
  { value: "free_api", label: "Free API" },
  { value: "paid_api", label: "Paid API" },
];

export const TOOL_STATUSES = ["draft", "pending", "changes_requested", "approved_unpaid", "published", "rejected"] as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Waiting for review",
  changes_requested: "Changes requested",
  approved_unpaid: "Approved, payment due",
  published: "Live",
  rejected: "Not accepted",
};

/** Fields a submitter can propose in an edit request, with labels for
 * showing the change to an admin. */
export const EDITABLE_FIELDS: Record<string, string> = {
  name: "Name",
  tagline: "Tagline",
  description: "Description",
  website_url: "Link",
  category_id: "Category",
  pricing_type: "Pricing",
  screenshots: "Screenshots",
};

/** A listing link must be a plain http(s) URL: it's rendered as a link on
 * a public page, so anything else (javascript:, data:) is refused. */
export function cleanToolUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 500) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Alt text for a listing screenshot: the stored one, or a descriptive
 * fallback from the tool name. */
export function screenshotAlt(toolName: string, url: string, alts: Record<string, string> | null | undefined, index: number) {
  const stored = alts?.[url];
  return stored && stored.trim() ? stored : `${toolName} screenshot ${index + 1}`;
}

/** Search snippet from a long description: the first paragraph, cut at a
 * word boundary near 155 characters. Skips heading and list lines. */
export function metaFromDescription(description: string | null | undefined, max = 155): string {
  const first = (description || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("## ") && !p.startsWith("- "));
  if (!first) return "";
  const flat = first.replace(/\s+/g, " ");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "")}...`;
}

export type DescriptionBlock =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

/** Splits a plain-text description into blocks: "## " lines are headings,
 * "- " lines are bullet lists, everything else is a paragraph. */
export function parseDescription(description: string | null | undefined): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const chunk of (description || "").replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ type: "paragraph", text: para.join(" ") });
      para = [];
    };
    for (const line of lines) {
      if (line.startsWith("## ")) {
        flush();
        blocks.push({ type: "heading", text: line.slice(3).trim() });
      } else if (line.startsWith("- ")) {
        flush();
        const last = blocks[blocks.length - 1];
        if (last?.type === "list") last.items.push(line.slice(2).trim());
        else blocks.push({ type: "list", items: [line.slice(2).trim()] });
      } else {
        para.push(line);
      }
    }
    flush();
  }
  return blocks;
}
