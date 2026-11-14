import type { CSSProperties } from "react";
import { cssLength, type FormDesign, type FormElementStyle } from "@/lib/formsShape";

/** Turns an element's style bag into real inline styles.
 *
 * Both the console canvas (ConsoleFormEditor) and the live form (SavedForm)
 * import these, which is the whole point: the editor used to build its
 * preview styles by hand and only for a handful of properties, so the canvas
 * and the published form could disagree. Anything added here shows up in
 * both at once.
 *
 * Every element type gets the same treatment -- padding, size, spacing,
 * typography, border -- rather than the button being the only element with
 * layout controls.
 *
 * No server imports: safe in client components and plain node tests. */

/** Every length goes through cssLength, which means the console canvas
 * updates the moment someone types "48" (read as 48px) and a value the
 * browser would reject never reaches an inline style. */
const px = (value?: string): string | undefined => cssLength(value);

/** Margins and alignment: these belong on the element's own wrapper so they
 * push neighbouring elements around rather than padding the control. */
export function elementWrapperStyle(style?: FormElementStyle): CSSProperties {
  const out: CSSProperties = {};
  if (!style) return out;
  if (px(style.marginTop)) out.marginTop = px(style.marginTop);
  if (px(style.marginBottom)) out.marginBottom = px(style.marginBottom);
  if (style.textAlign) out.textAlign = style.textAlign;
  return out;
}

/** Horizontal placement for a box that carries its own width.
 *
 * `text-align` moves inline content, never a block-level box. Once a field
 * is given an explicit width its input becomes a sized block, so setting
 * Alignment to Center moved the *label* and left the box sitting on the
 * left -- and the console canvas disagreed with the live page about it,
 * because an unstyled <input> is inline-block (which text-align does move)
 * while the live one was block. Auto margins are what actually position a
 * sized box, and they behave the same in both. */
export function elementAlignStyle(style?: FormElementStyle): CSSProperties {
  // A full-width box has nowhere to move, so alignment stays purely textual.
  if (!style?.textAlign || !cssLength(style.width)) return {};
  if (style.textAlign === "center") return { marginLeft: "auto", marginRight: "auto" };
  if (style.textAlign === "right") return { marginLeft: "auto", marginRight: "0" };
  return { marginLeft: "0", marginRight: "auto" };
}

function applyBox(out: CSSProperties, style: FormElementStyle): void {
  const padX = px(style.paddingX) ?? px(style.padding);
  const padY = px(style.paddingY) ?? px(style.padding);
  if (padX) {
    out.paddingLeft = padX;
    out.paddingRight = padX;
  }
  if (padY) {
    out.paddingTop = padY;
    out.paddingBottom = padY;
  }
  const width = px(style.width);
  if (width) {
    out.width = width;
    // A sized box is positioned by its margins, not by the parent's
    // text-align -- see elementAlignStyle.
    Object.assign(out, elementAlignStyle(style));
  }
  const height = px(style.height);
  if (height) {
    out.height = height;
    // A fixed height plus vertical padding would otherwise overflow the box.
    out.boxSizing = "border-box";
  }
  const fontSize = px(style.fontSize);
  if (fontSize) out.fontSize = fontSize;
  if (style.fontWeight) out.fontWeight = style.fontWeight;
  const borderWidth = px(style.borderWidth);
  if (borderWidth) {
    out.borderWidth = borderWidth;
    out.borderStyle = "solid";
  }
}

/** Headings, paragraphs and dividers. */
export function elementTextStyle(design: FormDesign, style?: FormElementStyle): CSSProperties {
  const out: CSSProperties = {};
  const color = style?.textColor || design.textColor;
  if (color) out.color = color;
  if (style?.textAlign) out.textAlign = style.textAlign;
  if (style?.backgroundColor) out.backgroundColor = style.backgroundColor;
  const radius = px(style?.borderRadius);
  if (radius) out.borderRadius = radius;
  if (style?.borderColor) out.borderColor = style.borderColor;
  if (style) applyBox(out, style);
  return out;
}

/** Text inputs, textareas, selects, pickers and choice rows. */
export function elementInputStyle(design: FormDesign, style?: FormElementStyle): CSSProperties {
  const out: CSSProperties = {};
  const borderColor = style?.borderColor || design.borderColor;
  if (borderColor) out.borderColor = borderColor;
  const radius = px(style?.borderRadius) || px(design.borderRadius);
  if (radius) out.borderRadius = radius;
  if (style?.backgroundColor) out.backgroundColor = style.backgroundColor;
  const color = style?.textColor || design.textColor;
  if (color) out.color = color;
  // The value typed into the box follows the element's alignment too, so
  // "Center" centres the label, the box and its contents rather than leaving
  // the text hanging off one edge of a centred box.
  if (style?.textAlign) out.textAlign = style.textAlign;
  if (style) applyBox(out, style);
  // Placeholder colour can't go on an inline `style` -- CSS only exposes it
  // through ::placeholder -- so it rides along as a CSS variable that the
  // shared `.form-field-input::placeholder` rule in globals.css reads.
  if (style?.placeholderColor) {
    (out as Record<string, string>)["--ph-color"] = style.placeholderColor;
  }
  return out;
}

/** Buttons. Width and height here are what give a button a genuinely custom
 * size; `buttonAlign` only decides where a non-full-width button sits. */
export function elementButtonStyle(design: FormDesign, style?: FormElementStyle): CSSProperties {
  const out: CSSProperties = {};
  const bg = style?.backgroundColor || design.buttonColor;
  if (bg) out.backgroundColor = bg;
  const color = style?.textColor || design.buttonTextColor;
  if (color) out.color = color;
  const radius = px(style?.borderRadius) || px(design.borderRadius);
  if (radius) out.borderRadius = radius;
  if (style?.borderColor) out.borderColor = style.borderColor;
  if (style) applyBox(out, style);
  return out;
}

/** A field is a label plus a control, and the two have to move together.
 *
 * The sizing and placement belong to the pair, not to the input: when a
 * field is 280px wide and centred, the label has to sit on the left edge of
 * that 280px box -- not centred over it, and not away at the form's far
 * left. So the group carries the width and the auto margins, the control
 * fills the group, and the label is left-aligned inside it regardless of
 * the element's alignment (which positions the box, and the value typed
 * into it, but never the label). */
export function fieldLayout(
  design: FormDesign,
  style?: FormElementStyle,
): { group: CSSProperties; control: CSSProperties } {
  const { box, paint } = splitBoxStyle(elementInputStyle(design, style));
  const group: CSSProperties = { ...elementWrapperStyle(style), ...box };
  // The group must not inherit text alignment: that would drag the label
  // along with the box, which is the thing being fixed here.
  delete group.textAlign;
  const control: CSSProperties = { ...paint };
  if (box.width !== undefined) control.width = "100%";
  return { group, control };
}

/** Splits a computed control style into the part that sizes and positions
 * the control as a whole, and the part that paints it.
 *
 * A composite control -- the phone field is a country button next to an
 * input -- would otherwise apply the full style to each piece, so a 280px
 * width produced a 560px-wide row. The wrapper takes the box, each piece
 * takes the paint. */
export function splitBoxStyle(style: CSSProperties): { box: CSSProperties; paint: CSSProperties } {
  const { width, marginLeft, marginRight, ...paint } = style;
  const box: CSSProperties = {};
  if (width !== undefined) box.width = width;
  if (marginLeft !== undefined) box.marginLeft = marginLeft;
  if (marginRight !== undefined) box.marginRight = marginRight;
  return { box, paint };
}

/** True when the element sets its own width, so the caller should drop the
 * `w-full` utility class that would otherwise win the specificity contest
 * against an inline width (it does not -- inline wins -- but a `w-full`
 * button inside a flex row still stretches its flex basis, which reads as
 * the custom width being ignored). */
export function hasCustomWidth(style?: FormElementStyle): boolean {
  return Boolean(px(style?.width));
}
