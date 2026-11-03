/** Scopes a hand-written stylesheet to one page section, so the "custom"
 * block (src/lib/pageBlocks.ts) can carry its own real CSS without any
 * rule leaking out and restyling the rest of the site.
 *
 * The mechanism is native CSS nesting: wrapping the author's rules in
 * `#blk_x { ... }` makes the browser itself resolve `.card` to
 * `#blk_x .card` and bare `h2` to `#blk_x h2` -- no selector parser of
 * our own, so there is nothing to get subtly wrong about `:is()`,
 * attribute selectors with braces in their values, `::before`, commas
 * inside `:not(...)`, and so on. Nesting is supported by every browser
 * this site already targets (Chrome 120+, Safari 17.2+, Firefox 117+).
 *
 * The one thing nesting can't do is carry an at-rule that is only legal
 * at the top level of a stylesheet -- `@keyframes`, `@font-face`,
 * `@property`, `@import` -- so those are lifted back out and emitted
 * unwrapped. `@media`/`@supports`/`@container` nest fine and stay put.
 *
 * Consequence worth knowing when authoring: a hoisted `@keyframes` name
 * is global, shared with every other custom block on the page, so names
 * want a prefix of their own. Documented on the block's css field. */

/** At-rules that are invalid inside a style rule and so get hoisted out
 * of the scoping wrapper rather than nested inside it. */
const TOP_LEVEL_AT_RULES = ["keyframes", "font-face", "property", "import", "charset", "namespace", "page", "counter-style", "font-feature-values", "layer"];

const AT_RULE_NAME = /^@(-[a-z]+-)?([a-z-]+)/i;

/** Walks the stylesheet at depth 0 only, splitting it into the at-rule
 * blocks that have to stay at the top level and everything else. Tracks
 * strings and comments so a brace inside `content: "}"` or a comment
 * doesn't throw the depth count off. */
function splitTopLevelAtRules(css: string): { hoisted: string; rest: string } {
  const hoisted: string[] = [];
  const rest: string[] = [];
  let index = 0;
  let segmentStart = 0;

  const flushRest = (end: number) => {
    if (end > segmentStart) rest.push(css.slice(segmentStart, end));
  };

  while (index < css.length) {
    const char = css[index];

    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end === -1 ? css.length : end + 2;
      continue;
    }
    if (char === '"' || char === "'") {
      index = skipString(css, index);
      continue;
    }
    if (char !== "@") {
      index += 1;
      continue;
    }

    const name = css.slice(index).match(AT_RULE_NAME)?.[2]?.toLowerCase();
    if (!name || !TOP_LEVEL_AT_RULES.includes(name)) {
      // A nestable at-rule (@media, @supports, @container...): skip over
      // its whole body so braces inside it never look top-level.
      index = skipAtRule(css, index).end;
      continue;
    }

    const { end } = skipAtRule(css, index);
    flushRest(index);
    hoisted.push(css.slice(index, end));
    segmentStart = end;
    index = end;
  }

  flushRest(css.length);
  return { hoisted: hoisted.join("\n"), rest: rest.join("") };
}

function skipString(css: string, start: number): number {
  const quote = css[start];
  let index = start + 1;
  while (index < css.length) {
    if (css[index] === "\\") index += 2;
    else if (css[index] === quote) return index + 1;
    else index += 1;
  }
  return css.length;
}

/** From the `@` of an at-rule to just past its terminating `}` (or `;`
 * for a statement at-rule like `@import url(...);`). */
function skipAtRule(css: string, start: number): { end: number } {
  let index = start;
  let depth = 0;
  while (index < css.length) {
    const char = css[index];
    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end === -1 ? css.length : end + 2;
      continue;
    }
    if (char === '"' || char === "'") {
      index = skipString(css, index);
      continue;
    }
    if (char === ";" && depth === 0) return { end: index + 1 };
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return { end: index + 1 };
    }
    index += 1;
  }
  return { end: css.length };
}

/** `scopeId` is the block's own id (see newBlockId), used as the id of the
 * section element the block renders, so `#id` is both unique on the page
 * and specific enough to beat the site's own utility classes. */
export function scopeCss(css: string, scopeId: string): string {
  const source = css.trim();
  if (!source) return "";
  const { hoisted, rest } = splitTopLevelAtRules(source);
  const nested = rest.trim();
  // The author's own `:root { --x: ... }` would be a no-op once nested
  // under the section (a section is never the root element), so rewrite
  // it to the scope itself -- that is what "variables for this section"
  // plainly means, and custom properties still inherit to descendants.
  const scoped = nested ? `#${scopeId} {\n${nested.replace(/(^|[\s,{}])(:root|html|body)(?=[\s,{])/g, "$1&")}\n}` : "";
  return [hoisted, scoped].filter(Boolean).join("\n");
}
