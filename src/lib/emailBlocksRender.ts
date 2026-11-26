/** Turns an email's blocks (src/lib/emailBlocks.ts) into the HTML fragment
 * that becomes `body_html` -- the exact same contract every email surface
 * already reads (src/lib/email.ts's sendEmail(), the campaign editor's
 * template-copy, etc). Nothing downstream needs to change: this function
 * is the only new thing, slotting in wherever a template's body_html used
 * to come from a rich-text editor instead.
 *
 * Every block renders as `<table role="presentation">`/`<tr>`/`<td>` with
 * inline `style="..."` only -- no `<div>` layout, no CSS classes, nothing
 * that depends on a `<style>` block mail clients may strip (Outlook's Word
 * engine in particular). This is a plain, pure function: given the same
 * blocks and vars, always the same string. No server-only imports, so it
 * can run in a plain node test exactly like src/lib/pageBlocks.ts's
 * renderer-adjacent helpers.
 *
 * A block's rich-text fields (Text/Columns' `html`) are expected to
 * already be sanitized HTML by the time they reach here -- the server
 * caller that saves a template is responsible for that (sanitize-html is
 * too heavy to ship to the browser), exactly like pageBlocks.ts's own
 * richtext fields. */

import { escapeHtml } from "@/lib/escapeHtml";
import type { EmailBlock } from "@/lib/emailBlocks";

/** Raw {{var}} substitution, not auto-escaping -- same contract as
 * emailTemplates.ts's applyTemplateVars (every var passed in must already
 * be HTML-safe). Duplicated rather than imported: that file also imports
 * the DB pool, which this pure-render module must never pull in. */
function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, key) => vars[key] ?? match);
}

/** Absolute links only -- unlike pageBlocks.ts's safeHref, a relative
 * "/contact" is useless once the markup leaves the site inside an email. */
function safeEmailHref(value: unknown): string {
  const href = typeof value === "string" ? value.trim().slice(0, 500) : "";
  return /^(https:\/\/|mailto:|tel:)/i.test(href) || /^\{\{[a-zA-Z0-9_.]+\}\}$/.test(href) ? href : "";
}

function str(props: Record<string, unknown>, key: string, fallback = ""): string {
  const v = props[key];
  return typeof v === "string" ? v : fallback;
}
function num(props: Record<string, unknown>, key: string, fallback: number): number {
  const v = props[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function px(value: number): string {
  return `${Math.round(value)}px`;
}

/** The padding/background/alignment every block shares -- one `<td>`'s
 * worth of inline style, built once instead of per block type. */
function cellStyle(props: Record<string, unknown>, extra = ""): string {
  const bg = str(props, "backgroundColor");
  const paddingY = num(props, "paddingY", 12);
  const paddingX = num(props, "paddingX", 24);
  const align = str(props, "align", "left");
  return (
    `padding:${px(paddingY)} ${px(paddingX)};text-align:${align};` +
    (bg ? `background-color:${bg};` : "") +
    extra
  );
}

function textStyle(props: Record<string, unknown>): string {
  const color = str(props, "textColor");
  const fontSize = num(props, "fontSize", 16);
  const fontWeight = str(props, "fontWeight", "normal");
  return `font-family:Helvetica,Arial,sans-serif;font-size:${px(fontSize)};font-weight:${fontWeight};line-height:1.6;` + (color ? `color:${color};` : "color:#1a1a1a;");
}

/** One `<tr><td>` wrapper around a block's own content -- every block
 * renders through this, so the shared padding/background/alignment never
 * has to be repeated per type. */
function row(innerHtml: string, cellAttrs: string): string {
  return `<tr><td ${cellAttrs}>${innerHtml}</td></tr>`;
}

function renderHeading(props: Record<string, unknown>, vars: Record<string, string>): string {
  const text = escapeHtml(applyVars(str(props, "text"), vars));
  const level = str(props, "level", "1");
  const tag = ["1", "2", "3", "4"].includes(level) ? `h${level}` : "h1";
  return row(`<${tag} style="margin:0;${textStyle(props)}">${text}</${tag}>`, `style="${cellStyle(props)}"`);
}

function renderText(props: Record<string, unknown>, vars: Record<string, string>): string {
  const html = applyVars(str(props, "html"), vars);
  return row(`<div style="${textStyle(props)}">${html}</div>`, `style="${cellStyle(props)}"`);
}

function renderImage(props: Record<string, unknown>): string {
  const src = str(props, "src");
  if (!src) return "";
  const alt = escapeHtml(str(props, "alt"));
  const width = num(props, "width", 0);
  const widthAttr = width > 0 ? ` width="${Math.round(width)}"` : "";
  const widthStyle = width > 0 ? `width:${px(width)};max-width:100%;` : "max-width:100%;";
  const img = `<img src="${escapeHtml(src)}" alt="${alt}"${widthAttr} style="${widthStyle}height:auto;border:0;display:block;margin:${str(props, "align") === "center" ? "0 auto" : "0"};">`;
  const href = safeEmailHref(props.href);
  const content = href ? `<a href="${href}" style="text-decoration:none;">${img}</a>` : img;
  return row(content, `style="${cellStyle(props)}"`);
}

function renderButton(props: Record<string, unknown>, vars: Record<string, string>): string {
  const label = escapeHtml(applyVars(str(props, "label"), vars));
  const href = safeEmailHref(applyVars(str(props, "href"), vars));
  if (!href || !label) return "";
  const buttonColor = str(props, "buttonColor", "#0a0a0a");
  const buttonTextColor = str(props, "buttonTextColor", "#ffffff");
  const radius = num(props, "borderRadius", 6);
  // The bulletproof-button pattern: a table, not an <a> with padding --
  // Outlook renders an anchor's own padding/border-radius inconsistently,
  // but always renders a table cell's.
  const button =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${str(props, "align") === "center" ? "0 auto" : str(props, "align") === "right" ? "0 0 0 auto" : "0"};">` +
    `<tr><td style="border-radius:${px(radius)};background-color:${buttonColor};">` +
    `<a href="${href}" style="display:inline-block;padding:12px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${buttonTextColor};text-decoration:none;border-radius:${px(radius)};">${label}</a>` +
    `</td></tr></table>`;
  return row(button, `style="${cellStyle(props)}"`);
}

function renderDivider(props: Record<string, unknown>): string {
  const lineColor = str(props, "lineColor", "#e2e2e0");
  return row(`<div style="border-top:1px solid ${lineColor};line-height:0;font-size:0;">&nbsp;</div>`, `style="${cellStyle(props)}"`);
}

function renderSpacer(props: Record<string, unknown>): string {
  const height = num(props, "height", 24);
  return `<tr><td style="font-size:0;line-height:0;height:${px(height)};">&nbsp;</td></tr>`;
}

function renderColumns(props: Record<string, unknown>, vars: Record<string, string>): string {
  const left = applyVars(str(props, "leftHtml"), vars);
  const right = applyVars(str(props, "rightHtml"), vars);
  const style = textStyle(props);
  // A table-based 2-up layout, each column its own <td valign="top"> at
  // 50% width -- stacks naturally on a narrow (mobile) client the same
  // way a page's Columns block does, with no media query required: a
  // mail client that ignores the viewport just keeps them side by side,
  // which still reads fine at this width.
  const columns =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td valign="top" width="50%" style="${style}padding-right:12px;">${left}</td>` +
    `<td valign="top" width="50%" style="${style}padding-left:12px;">${right}</td>` +
    `</tr></table>`;
  return row(columns, `style="${cellStyle(props)}"`);
}

const SOCIAL_LABELS: Record<string, string> = { facebook: "Facebook", x: "X", instagram: "Instagram", linkedin: "LinkedIn" };

function renderSocialIcons(props: Record<string, unknown>): string {
  const iconColor = str(props, "iconColor", "#6b6b6b");
  const links = (["facebook", "x", "instagram", "linkedin"] as const)
    .map((platform) => ({ platform, href: safeEmailHref(props[platform]) }))
    .filter((l) => l.href);
  if (!links.length) return "";
  const cells = links
    .map(
      ({ platform, href }) =>
        `<td style="padding:0 8px;"><a href="${href}" style="color:${iconColor};text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;">${SOCIAL_LABELS[platform]}</a></td>`,
    )
    .join("");
  const table = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${str(props, "align") === "center" ? "0 auto" : "0"};"><tr>${cells}</tr></table>`;
  return row(table, `style="${cellStyle(props)}"`);
}

/** Preview-only inside the builder (see emailBlocks.ts's doc comment on
 * the "footer" type) -- the real footer is injected server-side by
 * src/lib/email.ts's withFooter() after this HTML is generated, using the
 * same colours this block's style fields write into the template's
 * stored footerStyle. This function never renders into the actual
 * body_html; it exists so the builder's canvas can show an accurate
 * preview of something that isn't really a block in the saved output. */
export function renderFooterPreview(
  props: Record<string, unknown>,
  businessName: string,
  address: string,
  socialProps?: Record<string, unknown>,
): string {
  const textColor = str(props, "textColor", "#6b6b6b");
  const linkColor = str(props, "linkColor", "#dc2626");
  const addressLine = address ? ` &middot; ${escapeHtml(address)}` : "";
  // The toggle borrows the links from the email's Social icons block; with
  // no such block (or no links in it) there is nothing to show, so say so.
  let social = "";
  if (props.showSocialIcons === true) {
    const icons = socialProps ? renderSocialIcons({ ...socialProps, align: "center" }) : "";
    social = icons
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${icons}</table>`
      : `<div style="padding:16px 24px 0;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:italic;color:${textColor};">Add a Social icons block with links to show them here.</div>`;
  }
  return (
    social +
    `<div style="padding:20px 24px;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${textColor};">` +
    `${escapeHtml(businessName)}${addressLine}<br>` +
    `<a href="#" style="color:${linkColor};text-decoration:underline;">Unsubscribe</a>` +
    `</div>`
  );
}

const RENDERERS: Record<string, (props: Record<string, unknown>, vars: Record<string, string>) => string> = {
  heading: renderHeading,
  text: renderText,
  image: (p) => renderImage(p),
  button: renderButton,
  divider: (p) => renderDivider(p),
  spacer: (p) => renderSpacer(p),
  columns: renderColumns,
  socialIcons: (p) => renderSocialIcons(p),
  // The footer block renders no visible row -- see renderFooterPreview's
  // doc comment. Its settings travel as a hidden marker instead (see
  // renderFooterMarker), read back by withFooter() at send time.
  footer: () => "",
};

/** What the Footer block's settings boil down to at send time. */
export type FooterStyle = { textColor?: string; linkColor?: string; socialHtml?: string };

const FOOTER_MARKER = /<!--ocrm-footer ([A-Za-z0-9+/=]*)-->/;
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function toBase64(text: string): string {
  return typeof btoa === "function"
    ? btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    : Buffer.from(text, "utf8").toString("base64");
}

/** The Footer block's settings as an HTML comment appended to body_html, so
 * they ride along every send path that already passes body_html through
 * (templates, campaigns, flows) without a separate column. Base64 so no
 * value can close the comment early. */
function renderFooterMarker(blocks: EmailBlock[]): string {
  const footer = blocks.find((b) => b.type === "footer");
  if (!footer) return "";
  const style: FooterStyle = {};
  const textColor = str(footer.props, "textColor");
  const linkColor = str(footer.props, "linkColor");
  if (HEX_COLOR.test(textColor)) style.textColor = textColor;
  if (HEX_COLOR.test(linkColor)) style.linkColor = linkColor;
  if (footer.props.showSocialIcons === true) {
    const social = blocks.find((b) => b.type === "socialIcons");
    const icons = social ? renderSocialIcons({ ...social.props, align: "center", backgroundColor: "" }) : "";
    if (icons) style.socialHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${icons}</table>`;
  }
  return `<!--ocrm-footer ${toBase64(JSON.stringify(style))}-->`;
}

/** Pulls the marker back out of an outgoing body: the html without it, plus
 * the parsed style (empty when absent or unreadable). Colours are
 * re-validated here since body_html can also be hand-written. */
export function extractFooterStyle(html: string): { html: string; style: FooterStyle } {
  const match = html.match(FOOTER_MARKER);
  if (!match) return { html, style: {} };
  const stripped = html.replace(FOOTER_MARKER, "");
  try {
    const raw = JSON.parse(Buffer.from(match[1], "base64").toString("utf8")) as FooterStyle;
    return {
      html: stripped,
      style: {
        textColor: raw.textColor && HEX_COLOR.test(raw.textColor) ? raw.textColor : undefined,
        linkColor: raw.linkColor && HEX_COLOR.test(raw.linkColor) ? raw.linkColor : undefined,
        socialHtml: typeof raw.socialHtml === "string" ? raw.socialHtml : undefined,
      },
    };
  } catch {
    return { html: stripped, style: {} };
  }
}

/** The full email body fragment: one `<table>` of rows, each block its own
 * row, in order. This -- not any individual block -- is what becomes
 * `body_html`. */
export function renderEmailBlocksToHtml(blocks: EmailBlock[], vars: Record<string, string> = {}): string {
  const rows = blocks
    .map((block) => RENDERERS[block.type]?.(block.props, vars) ?? "")
    .filter(Boolean)
    .join("");
  const marker = renderFooterMarker(blocks);
  if (!rows) return marker;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${marker}`;
}
