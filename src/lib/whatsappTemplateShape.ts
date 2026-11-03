/** The shape of a WhatsApp message template, and every pure function over
 * it: what its body is, which variables it uses, which buttons it has, and
 * the rules Meta enforces on all of that.
 *
 * Split out of whatsappTemplates.ts so the console components can use the
 * same functions. That file talks to the Graph API and to Postgres, and
 * importing it into a client component would pull a database pool into the
 * browser bundle -- which is why the first version of the template editor
 * had its own private copies of these helpers, free to drift out of step
 * with the server that validates the same draft. */
export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export type TemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "IN_APPEAL"
  | "PENDING_DELETION";

/** Interactive buttons supported by the console.
 *
 * QUICK_REPLY sends its own label back to us as a message; URL opens a link;
 * PHONE_NUMBER dials a number; OTP is the Authentication template's
 * one-time-code button. */
export type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string; example?: string[] }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string }
  | { type: "OTP"; otp_type: "COPY_CODE"; text?: string };

export type TemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: TemplateButton[];
  example?: unknown;
  add_security_recommendation?: boolean;
  code_expiration_minutes?: number;
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  status: TemplateStatus;
  category: TemplateCategory;
  language: string;
  components: TemplateComponent[];
  /** Only present when Meta rejected it; the reason they give is terse. */
  rejected_reason?: string | null;
  /** CRM/source bindings saved by this app, separate from Meta's sample values. */
  variableMappings?: { position: number; sourceKey: string; fixedValue?: string | null }[];
};

export type WhatsAppPhoneNumber = {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string | null;
  /** e.g. "TIER_1K" -- business-initiated conversations allowed per 24h. */
  messaging_limit_tier?: string | null;
  code_verification_status?: string | null;
  /** CONNECTED, PENDING, FLAGGED... only a connected number can send. */
  status?: string | null;
  /** Whether the display name customers see has been approved, and whether
   * a change to it is sitting in Meta's review queue. */
  name_status?: string | null;
  new_name_status?: string | null;
};
/** Header media Meta accepts on a template, with the limits it enforces.
 * Anything outside this is rejected at upload rather than at review. */
export const HEADER_MEDIA_TYPES: Record<string, { format: MediaFormat; maxBytes: number }> = {
  "image/jpeg": { format: "IMAGE", maxBytes: 5 * 1024 * 1024 },
  "image/png": { format: "IMAGE", maxBytes: 5 * 1024 * 1024 },
  "video/mp4": { format: "VIDEO", maxBytes: 16 * 1024 * 1024 },
  "application/pdf": { format: "DOCUMENT", maxBytes: 16 * 1024 * 1024 },
};

export type MediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT";
export type HeaderFormat = "NONE" | "TEXT" | MediaFormat;

/** The message type to send a given header format as. */
export const MEDIA_PARAM_TYPE: Record<MediaFormat, "image" | "video" | "document"> = {
  IMAGE: "image",
  VIDEO: "video",
  DOCUMENT: "document",
};

/** The body text of a template, for previews and for working out how many
 * variable values a test send needs. */
export function templateBody(template: WhatsAppTemplate): string {
  return template.components.find((c) => c.type === "BODY")?.text ||
    (template.category === "AUTHENTICATION" ? "One-time verification code" : "");
}

/** The media format of a template's header, or null for text-only ones.
 * A send of one of these has to include the media, so the caller needs to
 * know before building the message. */
export function templateHeaderMedia(template: WhatsAppTemplate): MediaFormat | null {
  const header = template.components.find((c) => c.type === "HEADER");
  const format = header?.format;
  return format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT" ? format : null;
}

/** The variables a body uses, in the order they appear: "Hi {{1}}, {{2}}" -> [1, 2]. */
export function templateVariables(body: string): number[] {
  return [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
}

/** Meta's own template rules, checked before we submit rather than after they
 * reject. Each of these is a real rejection/validation cause, and the first
 * two cost a manual round trip through their dashboard to discover. */
export function validateTemplateDraft(input: {
  name: string;
  body: string;
  samples: string[];
  buttons?: TemplateButton[] | null;
}): string | null {
  if (!/^[a-z0-9_]{1,512}$/.test(input.name)) {
    return "Name can only use lowercase letters, numbers and underscores.";
  }
  const body = input.body.trim();
  if (!body) return "Body cannot be empty.";
  if (body.length > 1024) return "Body cannot be longer than 1024 characters.";

  const vars = templateVariables(body);
  // Meta rejects a body that opens or closes on a variable: there has to be
  // real text around it so a reviewer can see the context.
  if (/^\s*\{\{\d+\}\}/.test(body)) return "Body cannot start with a variable. Put some text before it.";
  if (/\{\{\d+\}\}\s*$/.test(body)) return "Body cannot end with a variable. Add a closing line after it.";

  const expected = vars.map((_, i) => i + 1);
  if (vars.join(",") !== expected.join(",")) {
    return "Variables must be numbered in order with no gaps, starting at {{1}}.";
  }
  if (input.samples.length !== vars.length || input.samples.some((s) => !s.trim())) {
    return "Every variable needs an example value for Meta's review.";
  }
  return validateTemplateButtons(input.buttons);
}

/** Meta's button rules, checked here for the same reason as the body rules:
 * every one of these is a documented rejection, and the grouping rule in
 * particular fails with a bare "invalid combination" that says nothing
 * about what to change. */
export function validateTemplateButtons(buttons?: TemplateButton[] | null): string | null {
  if (!buttons?.length) return null;
  const otp = buttons.filter((button) => button.type === "OTP");
  if (otp.length) {
    return buttons.length === 1 && otp[0].otp_type === "COPY_CODE"
      ? null
      : "An Authentication template can only use one Copy code OTP button.";
  }
  if (buttons.length > 10) return "A template can have at most 10 buttons.";

  const quickReplies = buttons.filter((b) => b.type === "QUICK_REPLY");
  const urls = buttons.filter((b) => b.type === "URL");
  const phones = buttons.filter((b) => b.type === "PHONE_NUMBER");
  if (urls.length > 2) return "A template can have at most two link buttons.";
  if (phones.length > 1) return "A template can have only one call button.";

  for (const button of buttons) {
    if (button.type === "OTP") continue;
    if (!button.text.trim()) return "Every button needs a label.";
    if (button.text.length > 25) return "A button label cannot be longer than 25 characters.";
  }

  // Quick replies have to sit together, before or after the others. Mixed
  // in among them, Meta refuses the whole template.
  if (quickReplies.length) {
    const positions = buttons.map((b, i) => (b.type === "QUICK_REPLY" ? i : -1)).filter((i) => i >= 0);
    const contiguous = positions.every((position, i) => i === 0 || position === positions[i - 1] + 1);
    if (!contiguous) {
      return "Quick reply buttons have to be grouped together, either all before or all after the link and call buttons.";
    }
  }

  for (const button of urls) {
    if (!/^https:\/\/\S+$/i.test(button.url)) return "A link button needs a full https:// URL.";
    const variables = button.url.match(/\{\{\d+\}\}/g) || [];
    if (variables.length > 1) return "A link button can use at most one variable.";
    // Meta only allows the variable at the very end: the value is appended
    // to the URL, it is not substituted mid-string.
    if (variables.length === 1 && !/\{\{1\}\}$/.test(button.url)) {
      return "A link button's variable has to be {{1}} at the very end of the URL.";
    }
    if (variables.length === 1 && !button.example?.[0]?.trim()) {
      return "A link button with a variable needs an example of the finished URL.";
    }
  }

  for (const button of phones) {
    if (!/^\+?\d{6,20}$/.test(button.phone_number.trim())) {
      return "A call button needs a phone number with its country code.";
    }
  }
  return null;
}

/** The buttons on an existing template, as Meta reports them. */
export function templateButtons(template: WhatsAppTemplate): TemplateButton[] {
  return template.components.find((c) => c.type === "BUTTONS")?.buttons || [];
}

/** Recognizes an OTP Copy Code button whether Meta returns it as type OTP
 * or serialized as an internal OTP URL button with otp_type=COPY_CODE. */
export function isOtpCopyCodeButton(button: TemplateButton): boolean {
  if (button.type === "OTP" && button.otp_type === "COPY_CODE") return true;
  if (button.type === "URL" && (button.url?.includes("otp_type=COPY_CODE") || button.text?.toLowerCase() === "copy code")) {
    return true;
  }
  return false;
}

/** The position of a URL button whose link ends in a variable, or null.
 * A send has to supply that value, and Meta identifies the button by its
 * index within the buttons array. */
export function dynamicUrlButtonIndex(template: WhatsAppTemplate): number | null {
  const index = templateButtons(template).findIndex((b) => b.type === "URL" && /\{\{\d+\}\}/.test(b.url));
  return index === -1 ? null : index;
}

/** Builds the `components` array for sending a template.
 *
 * One builder for every send path -- test send, send to one contact, and
 * campaigns -- because each of the three needs the same three things
 * assembled in the same order, and the first version of this had the logic
 * copied into the test-send route only. */
export function buildSendComponents(input: {
  variables?: (string | null | undefined)[];
  media?: { type: "image" | "video" | "document"; link: string } | null;
  /** The value appended to a dynamic URL button's link, with its index. */
  urlButton?: { index: number; value: string } | null;
}): unknown[] | undefined {
  const components: unknown[] = [];
  if (input.media) {
    components.push({
      type: "header",
      parameters: [{ type: input.media.type, [input.media.type]: { link: input.media.link } }],
    });
  }
  const variables = (input.variables || []).map((v) => v ?? "");
  if (variables.length) {
    components.push({ type: "body", parameters: variables.map((text) => ({ type: "text", text })) });
  }
  if (input.urlButton) {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(input.urlButton.index),
      parameters: [{ type: "text", text: input.urlButton.value }],
    });
  }
  return components.length ? components : undefined;
}

/** The example values Meta holds for a template's variables.
 *
 * Every template has to be submitted with an example for each variable, so
 * these already exist and are meaningful for that specific template -- far
 * better defaults for a test send than "Example 1", and better than random
 * strings, which make a test message read like nonsense to whoever gets it. */
export function templateExampleValues(template: WhatsAppTemplate): string[] {
  const body = template.components.find((component) => component.type === "BODY");
  const examples = (body?.example as { body_text?: string[][] } | undefined)?.body_text?.[0];
  const count = templateVariables(body?.text || "").length;
  return Array.from({ length: count }, (_, index) => examples?.[index]?.trim() || `Example ${index + 1}`);
}
