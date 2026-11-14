import { z } from "zod";
import { NextRequest } from "next/server";
import { GET as blogListGET, POST as blogCreatePOST } from "@/app/api/v1/blog/route";
import { GET as blogGetGET, PATCH as blogUpdatePATCH } from "@/app/api/v1/blog/[slug]/route";
import { GET as directoryListGET, POST as directorySubmitPOST } from "@/app/api/v1/directory/tools/route";
import { GET as pagesListGET, POST as pageCreatePOST } from "@/app/api/v1/pages/route";
import { GET as pageGetGET, PATCH as pageUpdatePATCH, DELETE as pageDELETE } from "@/app/api/v1/pages/[id]/route";
import { POST as pagePublishPOST } from "@/app/api/v1/pages/[id]/publish/route";
import { POST as pageUnpublishPOST } from "@/app/api/v1/pages/[id]/unpublish/route";
import { GET as blockTypesGET } from "@/app/api/v1/pages/block-types/route";
import { POST as editTargetPOST } from "@/app/api/v1/pages/edit-target/route";
import { GET as mediaListGET, POST as mediaUploadPOST } from "@/app/api/v1/media/route";
import { GET as mediaGenerateGET, POST as mediaGeneratePOST } from "@/app/api/v1/media/generate/route";
import { GET as navigationGET, PUT as navigationPUT } from "@/app/api/v1/site/navigation/route";
import { GET as businessGET, PUT as businessPUT } from "@/app/api/v1/site/business/route";
import { GET as designGET, PUT as designPUT } from "@/app/api/v1/site/design/route";
import { GET as emailListGET } from "@/app/api/v1/email/route";
import { GET as emailGetGET, PATCH as emailUpdatePATCH } from "@/app/api/v1/email/[key]/route";
import { GET as contentTemplatesListGET, POST as contentTemplateCreatePOST } from "@/app/api/v1/email/content-templates/route";
import { GET as coursesListGET, POST as courseCreatePOST } from "@/app/api/v1/courses/route";
import { GET as courseGetGET, PATCH as courseUpdatePATCH } from "@/app/api/v1/courses/[id]/route";
import { GET as workflowsListGET, POST as workflowCreatePOST } from "@/app/api/v1/workflows/route";
import { GET as workflowGetGET, PATCH as workflowUpdatePATCH, DELETE as workflowDeleteDELETE } from "@/app/api/v1/workflows/[id]/route";
import { POST as workflowWebhookRotatePOST } from "@/app/api/v1/workflows/[id]/rotate-webhook/route";
import { POST as workflowTestPOST } from "@/app/api/v1/workflows/[id]/test/route";
import {
  GET as contentTemplateGetGET,
  PATCH as contentTemplateUpdatePATCH,
  DELETE as contentTemplateDeleteDELETE,
} from "@/app/api/v1/email/content-templates/[id]/route";
import { GET as formsListGET, POST as formCreatePOST } from "@/app/api/v1/forms/route";
import { GET as formGetGET, PATCH as formUpdatePATCH, DELETE as formDeleteDELETE } from "@/app/api/v1/forms/[id]/route";
import { GET as formSubmissionsGET } from "@/app/api/v1/forms/[id]/submissions/route";
import { DELETE as formSubmissionDeleteDELETE } from "@/app/api/v1/forms/[id]/submissions/[submissionId]/route";
import { GET as formElementTypesGET } from "@/app/api/v1/forms/element-types/route";
import { POST as placeFormOnPagePOST } from "@/app/api/v1/pages/[id]/place-form/route";

/** Tool definitions for the REMOTE MCP transport (src/app/api/mcp/route.ts).
 * This runs inside the same Next.js server process as the /api/v1/* route
 * handlers it wraps, so each tool calls the handler function directly --
 * no HTTP request back out to this same deployment's own public domain.
 * (An earlier version used `fetch()` for that self-call, which depends on
 * the box being able to reach its own public hostname from inside itself;
 * that's a real class of failure -- DNS, TLS, a reverse proxy/Cloudflare
 * hairpin -- and it's exactly what broke every tool with a bare "fetch
 * failed".) This is a TypeScript twin of scripts/mcp/tools.mjs (used by the
 * LOCAL stdio server): that one genuinely is a separate process reaching a
 * deployed site over the network, so it still has to use real HTTP. */

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

/** Builds an in-process request carrying only what the v1 handlers
 * actually read off it: the Authorization header, and a JSON body for
 * writes. The URL itself is never inspected by any handler (dynamic
 * [slug] params are passed straight to the handler below instead), it's
 * only here because NextRequest requires one. */
function fakeRequest(authHeader: string, body?: unknown, query?: Record<string, string | undefined>): NextRequest {
  const headers: Record<string, string> = { Authorization: authHeader };
  if (body === undefined) {
    const url = new URL("http://internal.local/");
    for (const [key, value] of Object.entries(query || {})) if (value !== undefined) url.searchParams.set(key, value);
    return new NextRequest(url, { method: "GET", headers });
  }
  headers["Content-Type"] = "application/json";
  return new NextRequest("http://internal.local/", { method: "POST", headers, body: JSON.stringify(body) });
}

async function unwrap(resPromise: Promise<Response>): Promise<unknown> {
  const res = await resPromise;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body;
}

const PAGE_FIELDS = {
  title: z.string().optional().describe("Page title (shown in the browser tab unless metaTitle is set)."),
  path: z.string().optional().describe("Address, e.g. /pricing or /services/web-design."),
  blocks: z
    .array(z.object({ type: z.string(), props: z.record(z.string(), z.unknown()).optional() }).passthrough())
    .optional()
    .describe("The page's sections, in order. Call list_page_block_types for every type and its props."),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  ogImage: z.string().optional().describe("https:// image URL for social sharing."),
  noindex: z.boolean().optional().describe("Hide from search engines."),
};

/** The authoring contract for a form element, exposed to MCP exactly as the
 * console editor understands it. Before this, `elements` was an untyped
 * record bag, so a model building a form had to guess every property name
 * and had no way to know which element types existed -- and anything it got
 * wrong was silently dropped by the normalizer. Pair with the
 * list_form_element_types tool, which returns the same vocabulary as data. */
const FORM_ELEMENT_STYLE_SCHEMA = z
  .object({
    width: z.string().optional().describe("CSS length: 240px, 50%, 20rem. Bare numbers are read as px."),
    height: z.string().optional().describe("CSS length. On a button this is its real height."),
    paddingX: z.string().optional().describe("Left/right padding."),
    paddingY: z.string().optional().describe("Top/bottom padding."),
    marginTop: z.string().optional().describe("Space above this element."),
    marginBottom: z.string().optional().describe("Space below this element."),
    fontSize: z.string().optional(),
    fontWeight: z.string().optional().describe("300-800."),
    borderWidth: z.string().optional(),
    borderRadius: z.string().optional().describe("e.g. 0px, 12px, 9999px for a pill."),
    backgroundColor: z.string().optional().describe("Any CSS colour."),
    textColor: z.string().optional(),
    labelColor: z.string().optional().describe("A field's own <label>. Falls back to textColor, then the form's."),
    placeholderColor: z.string().optional().describe("The placeholder text shown before anything is typed."),
    borderColor: z.string().optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
  })
  .describe(
    "Per-element layout and look. Applies to EVERY element type -- heading, paragraph, any input, button, divider -- not just buttons. Anything left out inherits the form's design tokens.",
  );

const FORM_ELEMENT_SCHEMA = z
  .object({
    id: z.string().optional().describe("Stable id. Generated when omitted."),
    type: z
      .enum([
        "heading",
        "text",
        "text_input",
        "full_name",
        "first_name",
        "last_name",
        "email",
        "phone",
        "textarea",
        "select",
        "radio",
        "multiselect",
        "checkbox",
        "country",
        "address",
        "number",
        "date",
        "hidden",
        "button",
        "divider",
      ])
      .describe("The element kind. This list is the complete set -- nothing else renders."),
    headingText: z.string().optional().describe("heading only."),
    headingLevel: z.enum(["h1", "h2", "h3", "h4"]).optional().describe("heading only."),
    headingAlign: z.enum(["left", "center", "right"]).optional().describe("heading only."),
    textContent: z.string().optional().describe("text (paragraph) only."),
    textMuted: z.boolean().optional().describe("text only: secondary colour."),
    textAlign: z.enum(["left", "center", "right"]).optional().describe("text only."),
    fieldKey: z
      .string()
      .optional()
      .describe("Submission key for field elements. Derived from the label when omitted."),
    fieldLabel: z.string().optional(),
    fieldPlaceholder: z.string().optional(),
    fieldRequired: z.boolean().optional(),
    fieldHidden: z.boolean().optional().describe("Collected silently (e.g. UTM capture) using fieldDefaultValue."),
    fieldDefaultValue: z.string().optional(),
    fieldOptions: z
      .string()
      .optional()
      .describe("Choices for select / radio / multiselect: a JSON array string, or newline- or comma-separated."),
    addToContact: z
      .boolean()
      .optional()
      .describe(
        "Whether this answer is copied onto the contact record. WHERE it lands is not a choice -- it follows from the element type (email->contact email, phone->phone, country->country, address->address, full_name/first_name/last_name->those names, everything else->a named extra contact detail). Defaults to true for those identity types and false for everything else.",
      ),
    contactDetailLabel: z
      .string()
      .optional()
      .describe("Name for the contact detail, for element types that become an extra contact detail."),
    buttonLabel: z.string().optional().describe("button only."),
    buttonAlign: z
      .enum(["full", "left", "center", "right"])
      .optional()
      .describe("button only. An explicit elementStyle.width overrides 'full'."),
    buttonVariant: z.enum(["primary", "outline"]).optional().describe("button only."),
    dividerSpacing: z.enum(["sm", "md", "lg"]).optional().describe("divider only."),
    elementStyle: FORM_ELEMENT_STYLE_SCHEMA.optional(),
  })
  .describe("One element on the form canvas. Order in the array is render order.");

const FORM_DESIGN_SCHEMA = z
  .object({
    buttonColor: z.string().optional(),
    buttonTextColor: z.string().optional(),
    borderColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
    placeholderColor: z.string().optional().describe("Form-wide fallback for a field's placeholder colour; a field's own placeholderColor still wins."),
    borderRadius: z.string().optional(),
    fontFamily: z.string().optional(),
    verifyInput: FORM_ELEMENT_STYLE_SCHEMA.optional().describe("Size and look of the 6-digit code box on the verification step."),
    verifyButton: FORM_ELEMENT_STYLE_SCHEMA.optional().describe("Size and look of the confirm button on the verification step."),
  })
  .describe("Form-wide design tokens. Any element's elementStyle overrides these for that element.");

const FORM_FIELD_SCHEMA = z.object({
  key: z.string().optional(),
  label: z.string().describe("Field label (or internal key for hidden fields)"),
  type: z
    .enum(["text", "full_name", "first_name", "last_name", "email", "phone", "textarea", "select", "radio", "multiselect", "checkbox", "country", "address", "number", "date"])
    .default("text"),
  options: z.string().optional().describe("Choices for select/radio/multiselect."),
  required: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false).describe("If true, hidden from visitors and submitted with defaultValue"),
  defaultValue: z.string().optional().default("").describe("Value submitted for hidden fields (e.g. UTM parameters)"),
  addToContact: z.boolean().optional(),
  contactDetailLabel: z.string().optional(),
});

const idParams = (id: unknown) => ({ params: Promise.resolve({ id: String(id) }) });

export function createMcpTools(authHeader: string): ToolDef[] {
  return [
    {
      name: "list_workflows",
      description: "List visual automation workflows, their triggers, status and available event triggers.",
      inputSchema: {},
      handler: async () => unwrap(workflowsListGET(fakeRequest(authHeader))),
    },
    {
      name: "create_workflow",
      description: "Create a database-backed workflow that starts from a supported site event or an incoming webhook. The response includes a one-time webhook URL when triggerType is webhook. Add nodes and edges with update_workflow, then activate it.",
      inputSchema: { name: z.string().optional(), description: z.string().optional(), triggerType: z.enum(["event", "webhook"]).optional(), triggerKey: z.string().optional() },
      handler: async (args) => unwrap(workflowCreatePOST(fakeRequest(authHeader, args))),
    },
    {
      name: "get_workflow",
      description: "Read a visual workflow graph and its latest execution history.",
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) => unwrap(workflowGetGET(fakeRequest(authHeader), idParams(id))),
    },
    {
      name: "update_workflow",
      description: "Save a visual workflow graph. Graph shape: {nodes:[{id,type:'workflow',position:{x,y},data:{kind,label,config}}],edges:[{id,source,target,sourceHandle?}]}. Node kinds: trigger, condition, wait, email, whatsapp, webhook, course_access, contact_update, contact_unsubscribe, contact_delete, stop. Email config supports from set to one of the deployment's Personal, Support, Reach, or Academy sender addresses. For condition branches connect sourceHandle true and false. Set status active only after all required action settings are complete.",
      inputSchema: { id: z.number().int().positive(), name: z.string().optional(), description: z.string().optional(), triggerType: z.enum(["event", "webhook"]).optional(), triggerKey: z.string().optional(), graph: z.unknown().optional(), status: z.enum(["draft", "active", "paused"]).optional() },
      handler: async ({ id, ...updates }) => unwrap(workflowUpdatePATCH(fakeRequest(authHeader, updates), idParams(id))),
    },
    {
      name: "rotate_workflow_webhook",
      description: "Rotate an incoming webhook workflow URL. The returned URL is shown once; the old URL stops working immediately.",
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) => unwrap(workflowWebhookRotatePOST(fakeRequest(authHeader, {}), idParams(id))),
    },
    {
      name: "test_workflow",
      description: "Execute a workflow graph immediately from its trigger, skipping Wait nodes. This sends real email and WhatsApp messages to the supplied testEmail and testPhone, and calls configured webhook destinations. Course access and contact-changing actions are skipped to protect real records. Use only recipients and endpoints you control. Omit graph to test the saved graph.",
      inputSchema: { id: z.number().int().positive(), graph: z.unknown().optional(), triggerKey: z.string().optional(), testEmail: z.string().optional(), testPhone: z.string().optional() },
      handler: async ({ id, ...input }) => unwrap(workflowTestPOST(fakeRequest(authHeader, input), idParams(id))),
    },
    {
      name: "delete_workflow",
      description: "Delete a visual workflow and its run history.",
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) => unwrap(workflowDeleteDELETE(fakeRequest(authHeader), idParams(id))),
    },
    {
      name: "list_courses",
      description: "List courses and curriculum counts. Course records and content live in the deployment database, not in Git files.",
      inputSchema: {},
      handler: async () => unwrap(coursesListGET(fakeRequest(authHeader))),
    },
    {
      name: "create_course",
      description: "Create a draft course record in the deployment database. Add its modules and lessons in Course Studio, or update its settings with update_course.",
      inputSchema: { title: z.string(), slug: z.string() },
      handler: async (args) => unwrap(courseCreatePOST(fakeRequest(authHeader, args))),
    },
    {
      name: "get_course",
      description: "Get a course's settings and full curriculum from the deployment database.",
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) => unwrap(courseGetGET(fakeRequest(authHeader), idParams(id))),
    },
    {
      name: "update_course",
      description: "Update course settings in the deployment database. Course Studio and this API use the same records; no course content needs a Git commit.",
      inputSchema: {
        id: z.number().int().positive(),
        title: z.string().optional(),
        slug: z.string().optional(),
        subtitle: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        cover_image_url: z.string().nullable().optional(),
        price: z.number().int().nullable().optional(),
        price_currency: z.enum(["INR", "USD"]).optional(),
        published: z.boolean().optional(),
      },
      handler: async ({ id, ...updates }) => unwrap(courseUpdatePATCH(fakeRequest(authHeader, updates), idParams(id))),
    },
    {
      name: "get_course_sales_page",
      description: "Get (creating a draft on first use) a course's independent optional sales page. The ordinary course page remains at /courses/{slug}; the sales page is /courses/{slug}/sales. Add a CTA link to /courses/{slug}/enroll for signup, access, or checkout.",
      inputSchema: { courseId: z.number().int().positive() },
      handler: async ({ courseId }) => unwrap(editTargetPOST(fakeRequest(authHeader, { kind: "course", refId: courseId }))),
    },
    {
      name: "save_course_sales_page",
      description: "Save the course's optional standalone sales page using the Pages editor blocks and metadata. Set publish=true to make /courses/{slug}/sales live. Link its CTA to /courses/{slug}/enroll.",
      inputSchema: {
        courseId: z.number().int().positive(),
        title: z.string().optional(),
        blocks: z.array(z.object({ type: z.string(), props: z.record(z.string(), z.unknown()).optional() }).passthrough()).optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        ogImage: z.string().optional(),
        noindex: z.boolean().optional(),
        publish: z.boolean().optional(),
      },
      handler: async ({ courseId, ...updates }) => {
        const target = await unwrap(editTargetPOST(fakeRequest(authHeader, { kind: "course", refId: courseId }))) as { page: { id: number } };
        return unwrap(pageUpdatePATCH(fakeRequest(authHeader, updates), idParams(target.page.id)));
      },
    },
    {
      name: "publish_course_sales_page",
      description: "Publish a course's optional sales page at /courses/{slug}/sales. The ordinary course page stays unchanged.",
      inputSchema: { courseId: z.number().int().positive() },
      handler: async ({ courseId }) => {
        const target = await unwrap(editTargetPOST(fakeRequest(authHeader, { kind: "course", refId: courseId }))) as { page: { id: number } };
        return unwrap(pagePublishPOST(fakeRequest(authHeader, {}), idParams(target.page.id)));
      },
    },
    {
      name: "unpublish_course_sales_page",
      description: "Take the optional course sales page offline without changing the normal course page or enrollments.",
      inputSchema: { courseId: z.number().int().positive() },
      handler: async ({ courseId }) => {
        const target = await unwrap(editTargetPOST(fakeRequest(authHeader, { kind: "course", refId: courseId }))) as { page: { id: number } };
        return unwrap(pageUnpublishPOST(fakeRequest(authHeader, {}), idParams(target.page.id)));
      },
    },
    {
      name: "list_pages",
      description: "List every page on the site (homepage, custom pages, built-in pages like /courses or /terms) with status. Built-in pages never edited have id null.",
      inputSchema: {},
      handler: async () => unwrap(pagesListGET(fakeRequest(authHeader))),
    },
    {
      name: "list_page_block_types",
      description:
        "The page builder's ready-made section library: every block type, its fields, allowed values, size limits and an example. These are a convenience, NOT the site's design system and NOT a limit on what a page can look like -- stacking hero + cards + faq reproduces the look of the existing pages. For a design of your own, use the \"custom\" block (your own HTML + a real scoped stylesheet, optionally full-bleed) and call get_design_system first.",
      inputSchema: {},
      handler: async () => unwrap(blockTypesGET(fakeRequest(authHeader))),
    },
    {
      name: "get_page",
      description: "Get one page by id: its sections (blocks), metadata, status, and the currently published version.",
      inputSchema: { id: z.number().int() },
      handler: async ({ id }) => unwrap(pageGetGET(fakeRequest(authHeader), idParams(id))),
    },
    {
      name: "create_page",
      description:
        "Create a new page at a new address. Lands as a draft unless status is 'published'. You have full design freedom here: for a bespoke page, build it out of \"custom\" blocks carrying your own HTML and CSS rather than filling in the stock hero/cards/faq sections, which will look like the rest of the site. Call get_design_system for the palette, fonts and constraints before you start.",
      inputSchema: { ...PAGE_FIELDS, title: z.string(), path: z.string(), status: z.enum(["draft", "published"]).default("draft") },
      handler: async (args) => unwrap(pageCreatePOST(fakeRequest(authHeader, args))),
    },
    {
      name: "update_page",
      description:
        "Save changes to a page's working copy (send only the fields to change; blocks replaces the whole list). Visitors don't see it until published -- pass publish: true to publish in the same call. Read the page back with get_page afterwards to see the normalized result, since over-long field values are truncated rather than rejected.",
      inputSchema: { id: z.number().int(), ...PAGE_FIELDS, publish: z.boolean().optional() },
      handler: async ({ id, ...rest }) => unwrap(pageUpdatePATCH(fakeRequest(authHeader, rest), idParams(id))),
    },
    {
      name: "publish_page",
      description: "Make a page's current working copy live.",
      inputSchema: { id: z.number().int() },
      handler: async ({ id }) => unwrap(pagePublishPOST(fakeRequest(authHeader, {}), idParams(id))),
    },
    {
      name: "unpublish_page",
      description: "Take a custom page offline (it 404s) without deleting it.",
      inputSchema: { id: z.number().int() },
      handler: async ({ id }) => unwrap(pageUnpublishPOST(fakeRequest(authHeader, {}), idParams(id))),
    },
    {
      name: "delete_page",
      description: "Delete a custom page. On a built-in page (e.g. /courses) this resets it to its default sections instead. The homepage can't be deleted.",
      inputSchema: { id: z.number().int() },
      handler: async ({ id }) => unwrap(pageDELETE(fakeRequest(authHeader), idParams(id))),
    },
    {
      name: "get_editable_page",
      description: "Get (creating on first use) the editable record for a built-in page by path (e.g. /courses, /terms), a course's optional standalone sales page, or a directory tool's extra sections by kind + refId. Returns the page with its id for update_page.",
      inputSchema: {
        path: z.string().optional(),
        kind: z.enum(["course", "tool"]).optional(),
        refId: z.union([z.string(), z.number()]).optional(),
      },
      handler: async (args) => unwrap(editTargetPOST(fakeRequest(authHeader, args))),
    },
    {
      name: "list_media_images",
      description: "Browse the Media Library (the same Cloudflare-hosted images /console/media manages): folders and image URLs under an optional folder prefix, to reuse an already-uploaded image instead of uploading it again.",
      inputSchema: {
        folder: z.string().optional().describe("Only list items under this folder, e.g. \"page-images\". Omit to list the top level."),
        recursive: z.boolean().optional().describe("List every image under the folder at once instead of one folder level at a time."),
      },
      handler: async ({ folder, recursive }) =>
        unwrap(mediaListGET(fakeRequest(authHeader, undefined, { prefix: folder as string | undefined, recursive: recursive ? "1" : undefined }))),
    },
    {
      name: "upload_media_image",
      description: "Put an image into the Media Library and get back its public URL, for a page block's image field, ogImage, a blog post's feature image, and so on. 5MB max, re-encoded to WebP and capped at 1600px wide. Pass exactly ONE of: sourceUrl -- a public http(s) URL this server downloads itself, right for an image that is already online. svg -- SVG markup this server rasterizes for you, which is how you upload an image you draw rather than one you photograph: charts, diagrams, framed layouts, title cards, logo lockups. SVG is text, so this works from any client, needs no image-generation provider, and costs nothing. dataBase64 -- the bytes inline, workable ONLY for a tiny image: the whole image has to be written out as base64 inside this tool call, and base64 of even a 300KB image is ~400,000 characters, past what a tool call carries and past what you can emit, which surfaces as a size error that shrinking the image never fixes. To create a photographic or illustrative image from a description, use generate_media_image instead -- it generates on the server, so nothing has to travel through this conversation.",
      inputSchema: {
        sourceUrl: z
          .string()
          .optional()
          .describe("A public http(s) URL to the image; the server downloads it itself, at any size up to 5MB, and nothing travels through the conversation."),
        svg: z.string().optional().describe("SVG markup, which this server rasterizes to a real image for you. The way to upload an image you construct rather than one you already have. Only self-contained markup: shapes, paths, text, gradients and filters, plus inline data:image/ URIs and #fragment references. Anything fetched over the network, plus <script> and <foreignObject>, is rejected."),
        width: z.number().int().optional().describe("With svg only: render width in pixels (16-4096). Omit to use the SVG's own size."),
        height: z.number().int().optional().describe("With svg only: render height in pixels (16-4096)."),
        dataBase64: z
          .string()
          .optional()
          .describe("Only for a tiny image: its raw bytes, base64-encoded (a data: URI also works). See the description for why this fails on anything bigger."),
        contentType: z.string().optional().describe("e.g. image/png. Optional -- taken from the download's own Content-Type, or from a data: URI that carries it. Ignored with svg."),
        filename: z.string().optional(),
        alt: z.string().optional().describe("Alt text, stored with the file."),
        title: z.string().optional(),
        folder: z.string().optional().describe("Which Media Library folder to upload into, e.g. \"page-images\". Defaults to \"uploads\"."),
      },
      handler: async (args) => unwrap(mediaUploadPOST(fakeRequest(authHeader, args))),
    },
    {
      name: "generate_media_image",
      description: "Generate an image from a text description and put it straight into the Media Library, returning its public URL to use in a page block, ogImage or feature image. USE THIS for any photographic or illustrative image. Generation happens on the server with this deployment's own provider key, so the only thing that travels is your prompt -- which is what makes it work at all from a hosted chat client, where an image your own built-in image tool produced has no public URL to hand over and its bytes are far too large to write into a tool call. For an image you would rather construct exactly (a chart, a diagram, a title card), write SVG and pass it to upload_media_image's svg parameter instead -- no provider needed and no cost. Call this with no prompt, or read GET /api/v1/media/generate, to see which providers this deployment has keys for.",
      inputSchema: {
        prompt: z.string().describe("What the image should show. Be specific about subject, composition and style -- and keep it on-brand: call get_design_system first, since a generated image that fights the site's palette is the usual way this goes wrong."),
        width: z.number().int().optional().describe("Pixels, 16-4096. Default 1024. Match the shape the design needs -- a wide hero wants a landscape size, not a square one cropped."),
        height: z.number().int().optional().describe("Pixels, 16-4096. Default 1024."),
        quality: z.enum(["low", "medium", "high"]).optional(),
        transparent: z.boolean().optional().describe("Transparent background, where the model supports it. Good for a logo or a cut-out element."),
        provider: z.enum(["pollinations", "openai", "gemini"]).optional().describe("Omit to use this deployment's configured default."),
        model: z.string().optional().describe("Omit to use the provider's configured model."),
        folder: z.string().optional().describe('Media Library folder. Defaults to "page-images".'),
        alt: z.string().optional().describe("Alt text. Defaults to the prompt, but a purpose-written one is better."),
        title: z.string().optional(),
      },
      handler: async (args) =>
        unwrap(
          (args.prompt ? mediaGeneratePOST(fakeRequest(authHeader, args)) : mediaGenerateGET(fakeRequest(authHeader)))
        ),
    },
    {
      name: "get_navigation",
      description: "Get the header menu, header button, footer columns, footer tagline and social links.",
      inputSchema: {},
      handler: async () => unwrap(navigationGET(fakeRequest(authHeader))),
    },
    {
      name: "update_navigation",
      description: "Replace the header menu, footer and social links. Send the whole object (get_navigation first). Header item types: dropdown {label, columns:[{title, links[]}]}, link {label, href}. Dropdowns support up to five columns.",
      inputSchema: {
        header: z.object({ items: z.array(z.record(z.string(), z.unknown())), ctaLabel: z.string(), ctaHref: z.string() }),
        footer: z.object({ tagline: z.string(), columns: z.array(z.record(z.string(), z.unknown())) }),
        socials: z.record(z.string(), z.string()).optional(),
      },
      handler: async (args) => unwrap(navigationPUT(fakeRequest(authHeader, args))),
    },
    {
      name: "get_design_system",
      description:
        "This site's design system, for building a page section by hand: the brand palette with its CSS variables, the display/body fonts, the real layout measurements the stock sections use, and the platform constraints that otherwise fail silently -- above all that the site's Tailwind utility classes do NOT work inside a custom block's HTML (write real CSS in its css field instead), plus which image/script/frame hosts the Content-Security-Policy allows. Also returns the owner's own brand direction. Read this before designing any page.",
      inputSchema: {},
      handler: async () => unwrap(designGET(fakeRequest(authHeader))),
    },
    {
      name: "update_design_notes",
      description:
        "Set the owner's brand direction: free text every later page build should follow (e.g. \"black and white only, red reserved for warnings\", \"no rounded corners\", \"never use stock photos of people\"). Returned as brandNotes by get_design_system. Replaces whatever was there, so read it first.",
      inputSchema: { notes: z.string().describe("The brand direction, in plain prose. Up to 4000 characters.") },
      handler: async ({ notes }) => unwrap(designPUT(fakeRequest(authHeader, { notes }))),
    },
    {
      name: "get_business_details",
      description: "Get the business details shown in the footer, contact sections and legal pages (owner, registration number, email, phone, address, policy numbers).",
      inputSchema: {},
      handler: async () => unwrap(businessGET(fakeRequest(authHeader))),
    },
    {
      name: "update_business_details",
      description: "Replace the business details (send the whole profile from get_business_details with your changes; blank fields are hidden on the site).",
      inputSchema: { profile: z.record(z.string(), z.unknown()) },
      handler: async ({ profile }) => unwrap(businessPUT(fakeRequest(authHeader, profile))),
    },
    {
      name: "list_blog_posts",
      description: "List every blog post on this site, drafts included.",
      inputSchema: {},
      handler: async () => unwrap(blogListGET(fakeRequest(authHeader))),
    },
    {
      name: "get_blog_post",
      description: "Get one blog post's full content and metadata by slug.",
      inputSchema: { slug: z.string() },
      handler: async ({ slug }) =>
        unwrap(blogGetGET(fakeRequest(authHeader), { params: Promise.resolve({ slug: String(slug) }) })),
    },
    {
      name: "create_blog_post",
      description: "Create a new blog post (as a draft unless status is 'published').",
      inputSchema: {
        slug: z.string(),
        title: z.string(),
        html: z.string(),
        category: z.string(),
        status: z.enum(["draft", "published"]).default("draft"),
        excerpt: z.string().optional(),
        feature_image: z.string().optional(),
        feature_image_alt: z.string().optional(),
      },
      handler: async (args) => unwrap(blogCreatePOST(fakeRequest(authHeader, args))),
    },
    {
      name: "update_blog_post",
      description: "Update an existing blog post by slug (resend title/html/category -- use get_blog_post first).",
      inputSchema: {
        slug: z.string(),
        title: z.string(),
        html: z.string(),
        category: z.string(),
        status: z.enum(["draft", "published"]),
        excerpt: z.string().optional(),
        feature_image: z.string().optional(),
        feature_image_alt: z.string().optional(),
      },
      handler: async (args) => {
        const { slug } = args as { slug: string };
        return unwrap(blogUpdatePATCH(fakeRequest(authHeader, args), { params: Promise.resolve({ slug }) }));
      },
    },
    {
      name: "list_email_templates",
      description: "List every transactional email template this deployment sends (welcome emails, receipts, reminders...).",
      inputSchema: {},
      handler: async () => unwrap(emailListGET(fakeRequest(authHeader))),
    },
    {
      name: "get_email_template",
      description: "Get one email template's full subject/body and which {{vars}} it supports, by key.",
      inputSchema: { key: z.string() },
      handler: async ({ key }) => unwrap(emailGetGET(fakeRequest(authHeader), { params: Promise.resolve({ key: String(key) }) })),
    },
    {
      name: "update_email_template",
      description: "Edit an existing email template's subject, body, sender or open-tracking. There is no create or delete: every key is sent by one specific trigger elsewhere in the app.",
      inputSchema: {
        key: z.string(),
        subject: z.string(),
        bodyHtml: z.string(),
        fromEmail: z.string().optional(),
        trackOpens: z.boolean().optional(),
      },
      handler: async (args) => {
        const { key } = args as { key: string };
        return unwrap(emailUpdatePATCH(fakeRequest(authHeader, args), { params: Promise.resolve({ key }) }));
      },
    },
    {
      name: "list_content_templates",
      description: "List the reusable Email Library content templates -- one-off content picked from a campaign, an automation step, or when emailing a contact directly. Distinct from the fixed-trigger transactional templates in list_email_templates.",
      inputSchema: {},
      handler: async () => unwrap(contentTemplatesListGET(fakeRequest(authHeader))),
    },
    {
      name: "create_content_template",
      description: "Create a new Email Library content template (name, subject, HTML body). Unlike transactional templates, these can be freely created.",
      inputSchema: {
        name: z.string(),
        subject: z.string(),
        bodyHtml: z.string(),
      },
      handler: async (args) => unwrap(contentTemplateCreatePOST(fakeRequest(authHeader, args))),
    },
    {
      name: "get_content_template",
      description: "Get one Email Library content template by id.",
      inputSchema: { id: z.number() },
      handler: async ({ id }) => unwrap(contentTemplateGetGET(fakeRequest(authHeader), { params: Promise.resolve({ id: String(id) }) })),
    },
    {
      name: "update_content_template",
      description: "Edit an existing Email Library content template's name, subject or body.",
      inputSchema: {
        id: z.number(),
        name: z.string(),
        subject: z.string(),
        bodyHtml: z.string(),
      },
      handler: async (args) => {
        const { id } = args as { id: number };
        return unwrap(contentTemplateUpdatePATCH(fakeRequest(authHeader, args), { params: Promise.resolve({ id: String(id) }) }));
      },
    },
    {
      name: "delete_content_template",
      description: "Delete an Email Library content template by id.",
      inputSchema: { id: z.number() },
      handler: async ({ id }) =>
        unwrap(contentTemplateDeleteDELETE(fakeRequest(authHeader), { params: Promise.resolve({ id: String(id) }) })),
    },
    {
      name: "list_directory_tools",
      description: "List every tool in the tools directory, any status.",
      inputSchema: {},
      handler: async () => unwrap(directoryListGET(fakeRequest(authHeader))),
    },
    {
      name: "submit_directory_tool",
      description: "Submit a new tool to the directory. Lands as 'pending' until approved in the console.",
      inputSchema: {
        name: z.string(),
        category: z.string(),
        website_url: z.string(),
        pricing_type: z.enum(["free", "freemium", "paid", "free_api", "paid_api"]),
        tagline: z.string().optional(),
        description: z.string().optional(),
      },
      handler: async (args) => unwrap(directorySubmitPOST(fakeRequest(authHeader, args))),
    },
    {
      name: "list_form_element_types",
      description: "The complete form-authoring vocabulary: every element type that renders, every property each one takes, every per-element style key (width, height, padding, spacing, typography, border, colours -- available on ALL element types, not just buttons), and the contact-mapping options that decide which answers become data on the contact record. Read this before building or restyling a form with create_form / update_form; anything outside this vocabulary is dropped on save.",
      inputSchema: {},
      handler: async () => unwrap(formElementTypesGET(fakeRequest(authHeader))),
    },
    {
      name: "list_forms",
      description: "List all forms with their elements, fields, design tokens and submission counts. Forms can be standalone (/f/<slug>), embedded on pages, or opened as popups.",
      inputSchema: {},
      handler: async () => unwrap(formsListGET(fakeRequest(authHeader))),
    },
    {
      name: "get_form",
      description: "Get one form by ID or slug: its canvas elements with per-element styles, derived fields, design tokens, contact mappings, email verification setting and submission count.",
      inputSchema: { id: z.union([z.number().int().positive(), z.string()]).describe("Form ID or slug") },
      handler: async ({ id }) => unwrap(formGetGET(fakeRequest(authHeader), idParams(id))),
    },
    {
      name: "create_form",
      description: "Create a reusable form. Build it from `elements`, which is the real canvas: ordered headings, paragraphs, inputs, buttons and dividers, each freely styled through elementStyle (width, height, padding, spacing, typography, border, colours). Call list_form_element_types first for the full vocabulary. Can also start completely blank with just a name. `fields` is a simpler alternative to `elements` for a plain stack of inputs; pass one or the other, not both.",
      inputSchema: {
        name: z.string().describe("Internal name for the form"),
        slug: z.string().optional().describe("Optional URL-safe slug for standalone sharing at /f/<slug>"),
        heading: z.string().optional().describe("Heading shown above the form (ignored when elements include a heading)"),
        introText: z.string().optional().describe("Introductory text shown below the heading"),
        source: z.string().optional().describe("Contact source label shown on every contact who submits this form"),
        fields: z.array(FORM_FIELD_SCHEMA).optional().default([]),
        submitLabel: z.string().optional().describe("Button text (default: 'Submit')"),
        successHeading: z.string().optional().describe("Thank-you heading"),
        successText: z.string().optional().describe("Thank-you message"),
        successImage: z.string().optional().describe("Image URL shown in the thank-you popup"),
        notifyEmail: z.string().optional().describe("Email address to notify on submission"),
        verifyEmail: z.boolean().optional().describe("Send a 6-digit code and magic link to the email field, and only record the submission once it is confirmed. Requires a visible email element."),
        design: FORM_DESIGN_SCHEMA.optional(),
        submissionAction: z.enum(["message", "redirect"]).optional().describe("Submission outcome: 'message' or 'redirect'"),
        redirectUrl: z.string().optional().describe("URL to redirect to if submissionAction is 'redirect'"),
        elements: z.array(FORM_ELEMENT_SCHEMA).optional().describe("Canvas elements in render order. The preferred way to build a form."),
      },
      handler: async (args) => unwrap(formCreatePOST(fakeRequest(authHeader, args))),
    },
    {
      name: "update_form",
      description: "Update a form by ID or slug. Omitted properties keep their current values. Passing `elements` replaces the whole canvas, so read the form with get_form first and send the full list back with your changes. Every element's elementStyle can be set here -- that is how a form is restyled or an element resized.",
      inputSchema: {
        id: z.union([z.number().int().positive(), z.string()]).describe("Form ID or slug"),
        name: z.string().optional(),
        slug: z.string().optional(),
        heading: z.string().optional(),
        introText: z.string().optional(),
        source: z.string().optional().describe("Contact source label shown on every contact who submits this form"),
        fields: z.array(FORM_FIELD_SCHEMA).optional(),
        submitLabel: z.string().optional(),
        successHeading: z.string().optional(),
        successText: z.string().optional(),
        successImage: z.string().optional().describe("Image URL shown in the thank-you popup"),
        submissionAction: z.enum(["message", "redirect"]).optional().describe("Submission outcome: 'message' shows a thank-you popup, 'redirect' sends them to redirectUrl"),
        redirectUrl: z.string().optional().describe("URL to redirect to if submissionAction is 'redirect'"),
        elements: z.array(FORM_ELEMENT_SCHEMA).optional().describe("Canvas elements in render order. Replaces the existing canvas."),
        notifyEmail: z.string().optional(),
        verifyEmail: z.boolean().optional().describe("Two-step email verification. Can be turned on or off on any form, including the seeded Contact and Newsletter ones."),
        design: FORM_DESIGN_SCHEMA.optional(),
      },
      handler: async ({ id, ...updates }) => unwrap(formUpdatePATCH(fakeRequest(authHeader, updates), idParams(id))),
    },
    {
      name: "delete_form",
      description: "Permanently delete a form and its recorded submissions by ID or slug. Every form can be deleted except Sign up / Log in, whose field list core account access depends on. Deleting the seeded Newsletter form also stops newsletter signups through it; deleting Contact stops messages being filed as contact submissions.",
      inputSchema: { id: z.union([z.number().int().positive(), z.string()]).describe("Form ID or slug") },
      handler: async ({ id }) => unwrap(formDeleteDELETE(fakeRequest(authHeader), idParams(id))),
    },
    {
      name: "list_form_submissions",
      description: "Every answer a form has collected, newest first, with the contact each response was matched to.",
      inputSchema: { id: z.union([z.number().int().positive(), z.string()]).describe("Form ID or slug") },
      handler: async ({ id }) => unwrap(formSubmissionsGET(fakeRequest(authHeader), idParams(id))),
    },
    {
      name: "delete_form_submission",
      description: "Delete one recorded response. Any contact detail already promoted from it onto a contact record is kept -- remove those from the contact itself.",
      inputSchema: {
        id: z.union([z.number().int().positive(), z.string()]).describe("Form ID or slug"),
        submissionId: z.number().int().positive().describe("The submission id, from list_form_submissions"),
      },
      handler: async ({ id, submissionId }) =>
        unwrap(
          formSubmissionDeleteDELETE(fakeRequest(authHeader), {
            params: Promise.resolve({ id: String(id), submissionId: String(submissionId) }),
          }),
        ),
    },
    {
      name: "place_form_on_page",
      description: "Place a saved form on a page as a form section. Adds a 'form' block with mode='saved' and savedFormId.",
      inputSchema: {
        pageId: z.number().int().positive().describe("The page ID to place the form on"),
        formId: z.union([z.number().int().positive(), z.string()]).describe("Form ID or slug to place"),
        position: z.union([z.enum(["top", "bottom"]), z.number().int().min(0)]).optional().describe("Where to place the form block ('top', 'bottom', or block index). Defaults to 'bottom'."),
      },
      handler: async ({ pageId, ...args }) => unwrap(placeFormOnPagePOST(fakeRequest(authHeader, args), idParams(pageId))),
    },
  ];
}
