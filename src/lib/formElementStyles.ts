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
  if (width) out.width = width;
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
  if (style) applyBox(out, style);
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

/** True when the element sets its own width, so the caller should drop the
 * `w-full` utility class that would otherwise win the specificity contest
 * against an inline width (it does not -- inline wins -- but a `w-full`
 * button inside a flex row still stretches its flex basis, which reads as
 * the custom width being ignored). */
export function hasCustomWidth(style?: FormElementStyle): boolean {
  return Boolean(px(style?.width));
}
