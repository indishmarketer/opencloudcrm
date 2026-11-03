// Tool definitions for the LOCAL (stdio) MCP server -- see stdio.mjs.
// Each tool is a thin wrapper around this same deployment's own
// /api/v1/* HTTP API, authenticated with the caller's own API token
// (issued from /console/api-tokens). There is a parallel, TypeScript
// version of this same set of wrappers in src/lib/mcpTools.ts for the
// REMOTE transport (src/app/api/mcp/route.ts) -- both exist only
// because a plain Node script (no build step) and the Next.js app
// (TypeScript, bundled) can't share one module across that boundary
// cleanly; the actual business logic they both wrap is the one shared
// /api/v1/* API, not duplicated here.
import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME_BY_EXTENSION = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** @param {string} apiBase e.g. https://example.com */
/** @param {string} token the plaintext API token (sent as a Bearer header) */
export function createTools(apiBase, token) {
  async function call(path, init) {
    const res = await fetch(new URL(path, apiBase), {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  const pageFields = {
    title: z.string().optional(),
    path: z.string().optional(),
    blocks: z.array(z.object({ type: z.string(), props: z.record(z.string(), z.unknown()).optional() }).passthrough()).optional(),
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    ogImage: z.string().optional(),
    noindex: z.boolean().optional(),
  };

  return [
    {
      name: "list_courses",
      description: "List courses stored in this deployment's database, including draft/published status and curriculum counts. Course records and curriculum are runtime data; they are not source-code or GitHub seed content.",
      inputSchema: {},
      handler: async () => call("/api/v1/courses"),
    },
    {
      name: "create_course",
      description: "Create a draft course record in the deployment database. It appears in the Console Course Studio immediately. Add its curriculum in the dashboard; it is not committed to GitHub.",
      inputSchema: { title: z.string(), slug: z.string() },
      handler: async (args) => call("/api/v1/courses", { method: "POST", body: JSON.stringify(args) }),
    },
    {
      name: "get_course",
      description: "Get a course's saved settings and curriculum (modules, lessons and resources) from the deployment database.",
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) => call(`/api/v1/courses/${id}`),
    },
    {
      name: "update_course",
      description: "Update a course's database-backed settings. Set published=true only after curriculum, cover image and pricing satisfy publication readiness. Course changes do not require a GitHub content commit.",
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
      handler: async ({ id, ...updates }) => call(`/api/v1/courses/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
    },
    {
      name: "list_workflows",
      description: "List visual automation workflows, their triggers, status and available event triggers.",
      inputSchema: {},
      handler: async () => call("/api/v1/workflows"),
    },
    {
      name: "create_workflow",
      description: "Create a database-backed workflow that starts from a supported site event or an incoming webhook. The response includes a one-time webhook URL when triggerType is webhook. Add nodes and edges with update_workflow, then activate it.",
      inputSchema: { name: z.string().optional(), description: z.string().optional(), triggerType: z.enum(["event", "webhook"]).optional(), triggerKey: z.string().optional() },
      handler: async (args) => call("/api/v1/workflows", { method: "POST", body: JSON.stringify(args) }),
    },
    {
      name: "get_workflow",
      description: "Read a visual workflow graph and its latest execution history.",
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) => call(`/api/v1/workflows/${id}`),
    },
    {
      name: "update_workflow",
      description: "Save a visual workflow graph. Graph shape: {nodes:[{id,type:'workflow',position:{x,y},data:{kind,label,config}}],edges:[{id,source,target,sourceHandle?}]}. Node kinds: trigger, condition, wait, email, whatsapp, webhook, course_access, contact_update, contact_unsubscribe, contact_delete, stop. Email config supports from set to one of the deployment's Personal, Support, Reach, or Academy sender addresses. For condition branches connect sourceHandle true and false. Set status active only after all required action settings are complete.",
      inputSchema: { id: z.number().int().positive(), name: z.string().optional(), description: z.string().optional(), triggerType: z.enum(["event", "webhook"]).optional(), triggerKey: z.string().optional(), graph: z.unknown().optional(), status: z.enum(["draft", "active", "paused"]).optional() },
      handler: async ({ id, ...updates }) => call(`/api/v1/workflows/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
    },
    {
      name: "rotate_workflow_webhook",
      description: "Rotate an incoming webhook workflow URL. The returned URL is shown once; the old URL stops working immediately.",
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) => call(`/api/v1/workflows/${id}/rotate-webhook`, { method: "POST" }),
    },
    {
      name: "test_workflow",
      description: "Execute a workflow graph immediately from its trigger, skipping Wait nodes. This sends real email and WhatsApp messages to the supplied testEmail and testPhone, and calls configured webhook destinations. Course access and contact-changing actions are skipped to protect real records. Use only recipients and endpoints you control. Omit graph to test the saved graph.",
      inputSchema: { id: z.number().int().positive(), graph: z.unknown().optional(), triggerKey: z.string().optional(), testEmail: z.string().optional(), testPhone: z.string().optional() },
      handler: async ({ id, ...input }) => call(`/api/v1/workflows/${id}/test`, { method: "POST", body: JSON.stringify(input) }),
    },
    {
      name: "delete_workflow",
      description: "Delete a visual workflow and its run history.",
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) => call(`/api/v1/workflows/${id}`, { method: "DELETE" }),
    },
    {
      name: "list_pages",
      description: "List every page on the site (homepage, custom pages, built-in pages) with status.",
      inputSchema: {},
      handler: async () => call("/api/v1/pages"),
    },
    {
      name: "list_page_block_types",
      description:
        "The page builder's ready-made section library: every block type, its fields, size limits and an example. These are a convenience, NOT the site's design system and NOT a limit on what a page can look like -- stacking hero + cards + faq reproduces the look of the existing pages. For a design of your own, use the \"custom\" block (your own HTML + a real scoped stylesheet, optionally full-bleed) and call get_design_system first.",
      inputSchema: {},
      handler: async () => call("/api/v1/pages/block-types"),
    },
    {
      name: "get_page",
      description: "Get one page by id, with its sections (blocks).",
      inputSchema: { id: z.number().int() },
      handler: async ({ id }) => call(`/api/v1/pages/${id}`),
    },
    {
      name: "create_page",
      description:
        "Create a new page. Draft unless status is 'published'. You have full design freedom: for a bespoke page, build it out of \"custom\" blocks carrying your own HTML and CSS rather than filling in the stock hero/cards/faq sections, which will look like the rest of the site. Call get_design_system for the palette, fonts and constraints before you start.",
      inputSchema: { ...pageFields, title: z.string(), path: z.string(), status: z.enum(["draft", "published"]).default("draft") },
      handler: async (args) => call("/api/v1/pages", { method: "POST", body: JSON.stringify(args) }),
    },
    {
      name: "update_page",
      description:
        "Save changes to a page's working copy; pass publish: true to publish in the same call. Read the page back with get_page afterwards to see the normalized result, since over-long field values are truncated rather than rejected.",
      inputSchema: { id: z.number().int(), ...pageFields, publish: z.boolean().optional() },
      handler: async ({ id, ...rest }) => call(`/api/v1/pages/${id}`, { method: "PATCH", body: JSON.stringify(rest) }),
    },
    {
      name: "publish_page",
      description: "Make a page's working copy live.",
      inputSchema: { id: z.number().int() },
      handler: async ({ id }) => call(`/api/v1/pages/${id}/publish`, { method: "POST" }),
    },
    {
      name: "unpublish_page",
      description: "Take a custom page offline without deleting it.",
      inputSchema: { id: z.number().int() },
      handler: async ({ id }) => call(`/api/v1/pages/${id}/unpublish`, { method: "POST" }),
    },
    {
      name: "delete_page",
      description: "Delete a custom page (resets a built-in page to its defaults).",
      inputSchema: { id: z.number().int() },
      handler: async ({ id }) => call(`/api/v1/pages/${id}`, { method: "DELETE" }),
    },
    {
      name: "get_editable_page",
      description: "Get (creating on first use) the editable record for a built-in page by path, a course's standalone optional sales page by kind=course + refId, or a tool's extra sections by kind=tool + refId.",
      inputSchema: { path: z.string().optional(), kind: z.enum(["course", "tool"]).optional(), refId: z.union([z.string(), z.number()]).optional() },
      handler: async (args) => call("/api/v1/pages/edit-target", { method: "POST", body: JSON.stringify(args) }),
    },
    {
      name: "get_course_sales_page",
      description: "Get (creating a draft on first use) the independent optional sales page for a course. The ordinary course page stays at /courses/{slug}; a published sales page lives at /courses/{slug}/sales and replaces nothing on the ordinary page. Use the page builder blocks as for any site page. For CTA buttons, link to /courses/{slug}/enroll: free courses grant access and send a new account back to the course; paid-only courses continue to checkout. Course content and page blocks are stored in the deployment database, not in Git files.",
      inputSchema: { courseId: z.number().int().positive() },
      handler: async ({ courseId }) => call("/api/v1/pages/edit-target", { method: "POST", body: JSON.stringify({ kind: "course", refId: courseId }) }),
    },
    {
      name: "save_course_sales_page",
      description: "Save the working copy of a course's standalone sales page with the same blocks and metadata as the Pages editor. Set publish=true to publish it at /courses/{slug}/sales. Include a CTA button linked to /courses/{slug}/enroll so free-course visitors get access after signup and paid-only visitors continue to checkout.",
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
        const target = await call("/api/v1/pages/edit-target", { method: "POST", body: JSON.stringify({ kind: "course", refId: courseId }) });
        return call(`/api/v1/pages/${target.page.id}`, { method: "PATCH", body: JSON.stringify(updates) });
      },
    },
    {
      name: "publish_course_sales_page",
      description: "Publish a course's saved sales page. It becomes available at /courses/{slug}/sales; the normal course page remains at /courses/{slug}.",
      inputSchema: { courseId: z.number().int().positive() },
      handler: async ({ courseId }) => {
        const target = await call("/api/v1/pages/edit-target", { method: "POST", body: JSON.stringify({ kind: "course", refId: courseId }) });
        return call(`/api/v1/pages/${target.page.id}/publish`, { method: "POST" });
      },
    },
    {
      name: "unpublish_course_sales_page",
      description: "Take the optional sales page offline while leaving the ordinary course page and course enrollments intact.",
      inputSchema: { courseId: z.number().int().positive() },
      handler: async ({ courseId }) => {
        const target = await call("/api/v1/pages/edit-target", { method: "POST", body: JSON.stringify({ kind: "course", refId: courseId }) });
        return call(`/api/v1/pages/${target.page.id}/unpublish`, { method: "POST" });
      },
    },
    {
      name: "list_media_images",
      description: "Browse the Media Library: folders and image URLs under an optional folder prefix, to reuse an already-uploaded image instead of uploading it again.",
      inputSchema: {
        folder: z.string().optional().describe('Only list items under this folder, e.g. "page-images". Omit to list the top level.'),
        recursive: z.boolean().optional().describe("List every image under the folder at once instead of one folder level at a time."),
      },
      handler: async ({ folder, recursive }) => {
        const params = new URLSearchParams();
        if (folder) params.set("prefix", folder);
        if (recursive) params.set("recursive", "1");
        return call(`/api/v1/media?${params}`);
      },
    },
    {
      name: "upload_media_image",
      description:
        "Put an image into the Media Library and get back its public URL, for a page block's image field, ogImage, a blog post's feature image, and so on. 5MB max, re-encoded to WebP and capped at 1600px wide. Pass exactly ONE of: filePath -- a file on this machine, read and uploaded by this server process. sourceUrl -- a public http(s) URL this server downloads itself, right for an image that is already online. svg -- SVG markup this server rasterizes for you, which is how you upload an image you draw rather than one you photograph: charts, diagrams, framed layouts, title cards, logo lockups. SVG is text, so this works from any client, needs no image-generation provider, and costs nothing. dataBase64 -- the bytes inline, workable ONLY for a tiny image: the whole image has to be written out as base64 inside this tool call, and base64 of even a 300KB image is ~400,000 characters, past what a tool call carries and past what you can emit, which surfaces as a size error that shrinking the image never fixes. To create a photographic or illustrative image from a description, use generate_media_image instead -- it generates on the server, so nothing has to travel through this conversation.",
      inputSchema: {
        filePath: z
          .string()
          .optional()
          .describe("PREFERRED when the image is on this machine (e.g. one just generated locally): its path. Read and uploaded by this server process, so the bytes never pass through the conversation."),
        sourceUrl: z
          .string()
          .optional()
          .describe("PREFERRED when the image is already online: a public http(s) URL, which the site downloads itself. E.g. the URL an image-generation API just returned."),
        svg: z.string().optional().describe("SVG markup, which this server rasterizes to a real image for you. The way to upload an image you construct rather than one you already have. Only self-contained markup: shapes, paths, text, gradients and filters, plus inline data:image/ URIs and #fragment references. Anything fetched over the network, plus <script> and <foreignObject>, is rejected."),
        width: z.number().int().optional().describe("With svg only: render width in pixels (16-4096). Omit to use the SVG's own size."),
        height: z.number().int().optional().describe("With svg only: render height in pixels (16-4096)."),
        dataBase64: z
          .string()
          .optional()
          .describe("Only for a tiny image: its raw bytes, base64-encoded (a data: URI also works)."),
        contentType: z.string().optional().describe("e.g. image/png. Optional -- inferred from filePath's extension, the download's own Content-Type, or a data: URI that carries it."),
        filename: z.string().optional(),
        alt: z.string().optional(),
        title: z.string().optional(),
        folder: z.string().optional().describe('Which Media Library folder to upload into, e.g. "page-images". Defaults to "uploads".'),
      },
      // filePath is handled here rather than server-side for the obvious
      // reason: this process runs on the user's machine and the deployed
      // site does not, so a local path only means anything on this side.
      // Reading it here and posting the bytes over HTTPS is also what keeps
      // a locally generated image out of the model's own output budget --
      // see the description.
      handler: async ({ filePath, ...rest }) => {
        if (!filePath) return call("/api/v1/media", { method: "POST", body: JSON.stringify(rest) });
        if (rest.sourceUrl || rest.dataBase64 || rest.svg) throw new Error("Pass exactly one of filePath, sourceUrl, svg or dataBase64.");
        const bytes = await readFile(filePath).catch((error) => {
          throw new Error(`Could not read ${filePath}: ${error.code === "ENOENT" ? "no such file." : error.message}`);
        });
        const extension = path.extname(filePath).toLowerCase();
        const contentType = rest.contentType || MIME_BY_EXTENSION[extension];
        if (!contentType) {
          throw new Error(`Can't tell the image type from "${extension || filePath}". Pass contentType (one of ${[...new Set(Object.values(MIME_BY_EXTENSION))].join(", ")}).`);
        }
        return call("/api/v1/media", {
          method: "POST",
          body: JSON.stringify({ ...rest, contentType, filename: rest.filename || path.basename(filePath), dataBase64: bytes.toString("base64") }),
        });
      },
    },
    {
      name: "generate_media_image",
      description: "Generate an image from a text description and put it straight into the Media Library, returning its public URL to use in a page block, ogImage or feature image. USE THIS for any photographic or illustrative image. Generation happens on the server with this deployment's own provider key, so the only thing that travels is your prompt -- which is what makes it work at all from a hosted chat client, where an image your own built-in image tool produced has no public URL to hand over and its bytes are far too large to write into a tool call. For an image you would rather construct exactly (a chart, a diagram, a title card), write SVG and pass it to upload_media_image's svg parameter instead -- no provider needed and no cost. Call this with no prompt, or read GET /api/v1/media/generate, to see which providers this deployment has keys for.",
      inputSchema: {
        prompt: z.string().optional().describe("What the image should show. Be specific about subject, composition and style -- and keep it on-brand: call get_design_system first. Omit to list which providers this deployment has keys for."),
        width: z.number().int().optional().describe("Pixels, 16-4096. Default 1024. Match the shape the design needs."),
        height: z.number().int().optional().describe("Pixels, 16-4096. Default 1024."),
        quality: z.enum(["low", "medium", "high"]).optional(),
        transparent: z.boolean().optional(),
        provider: z.enum(["pollinations", "openai", "gemini"]).optional().describe("Omit to use this deployment's configured default."),
        model: z.string().optional(),
        folder: z.string().optional().describe('Media Library folder. Defaults to "page-images".'),
        alt: z.string().optional(),
        title: z.string().optional(),
      },
      handler: async (args) =>
        args.prompt
          ? call("/api/v1/media/generate", { method: "POST", body: JSON.stringify(args) })
          : call("/api/v1/media/generate"),
    },
    {
      name: "get_navigation",
      description: "Get the header menu, footer and social links.",
      inputSchema: {},
      handler: async () => call("/api/v1/site/navigation"),
    },
    {
      name: "update_navigation",
      description: "Replace the header menu, footer and social links (send the whole object).",
      inputSchema: {
        header: z.object({ items: z.array(z.record(z.string(), z.unknown())), ctaLabel: z.string(), ctaHref: z.string() }),
        footer: z.object({ tagline: z.string(), columns: z.array(z.record(z.string(), z.unknown())) }),
        socials: z.record(z.string(), z.string()).optional(),
      },
      handler: async (args) => call("/api/v1/site/navigation", { method: "PUT", body: JSON.stringify(args) }),
    },
    {
      name: "get_design_system",
      description:
        "This site's design system, for building a page section by hand: the brand palette with its CSS variables, the display/body fonts, the real layout measurements the stock sections use, and the platform constraints that otherwise fail silently -- above all that the site's Tailwind utility classes do NOT work inside a custom block's HTML (write real CSS in its css field instead), plus which image/script/frame hosts the Content-Security-Policy allows. Also returns the owner's own brand direction. Read this before designing any page.",
      inputSchema: {},
      handler: async () => call("/api/v1/site/design"),
    },
    {
      name: "update_design_notes",
      description:
        "Set the owner's brand direction: free text every later page build should follow (e.g. \"black and white only, red reserved for warnings\", \"no rounded corners\"). Returned as brandNotes by get_design_system. Replaces whatever was there, so read it first.",
      inputSchema: { notes: z.string().describe("The brand direction, in plain prose. Up to 4000 characters.") },
      handler: async ({ notes }) => call("/api/v1/site/design", { method: "PUT", body: JSON.stringify({ notes }) }),
    },
    {
      name: "get_business_details",
      description: "Get the business details shown in the footer, contact sections and legal pages.",
      inputSchema: {},
      handler: async () => call("/api/v1/site/business"),
    },
    {
      name: "update_business_details",
      description: "Replace the business details (send the whole profile).",
      inputSchema: { profile: z.record(z.string(), z.unknown()) },
      handler: async ({ profile }) => call("/api/v1/site/business", { method: "PUT", body: JSON.stringify(profile) }),
    },
    {
      name: "list_blog_posts",
      description: "List every blog post on this site, drafts included.",
      inputSchema: {},
      handler: async () => call("/api/v1/blog"),
    },
    {
      name: "get_blog_post",
      description: "Get one blog post's full content and metadata by slug.",
      inputSchema: { slug: z.string() },
      handler: async ({ slug }) => call(`/api/v1/blog/${encodeURIComponent(slug)}`),
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
      handler: async (args) => call("/api/v1/blog", { method: "POST", body: JSON.stringify(args) }),
    },
    {
      name: "update_blog_post",
      description: "Update an existing blog post by slug (partial fields are still required to resend title/html/category -- see get_blog_post first).",
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
      handler: async ({ slug, ...rest }) =>
        call(`/api/v1/blog/${encodeURIComponent(slug)}`, { method: "PATCH", body: JSON.stringify({ slug, ...rest }) }),
    },
    {
      name: "list_email_templates",
      description: "List every transactional email template this deployment sends (welcome emails, receipts, reminders...).",
      inputSchema: {},
      handler: async () => call("/api/v1/email"),
    },
    {
      name: "get_email_template",
      description: "Get one email template's full subject/body and which {{vars}} it supports, by key.",
      inputSchema: { key: z.string() },
      handler: async ({ key }) => call(`/api/v1/email/${encodeURIComponent(key)}`),
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
      handler: async ({ key, ...rest }) => call(`/api/v1/email/${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify(rest) }),
    },
    {
      name: "list_content_templates",
      description: "List the reusable Email Library content templates -- one-off content picked from a campaign, an automation step, or when emailing a contact directly. Distinct from the fixed-trigger transactional templates in list_email_templates.",
      inputSchema: {},
      handler: async () => call("/api/v1/email/content-templates"),
    },
    {
      name: "create_content_template",
      description: "Create a new Email Library content template (name, subject, HTML body). Unlike transactional templates, these can be freely created.",
      inputSchema: {
        name: z.string(),
        subject: z.string(),
        bodyHtml: z.string(),
      },
      handler: async (args) => call("/api/v1/email/content-templates", { method: "POST", body: JSON.stringify(args) }),
    },
    {
      name: "get_content_template",
      description: "Get one Email Library content template by id.",
      inputSchema: { id: z.number() },
      handler: async ({ id }) => call(`/api/v1/email/content-templates/${encodeURIComponent(id)}`),
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
      handler: async ({ id, ...rest }) =>
        call(`/api/v1/email/content-templates/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(rest) }),
    },
    {
      name: "delete_content_template",
      description: "Delete an Email Library content template by id.",
      inputSchema: { id: z.number() },
      handler: async ({ id }) => call(`/api/v1/email/content-templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },
    {
      name: "list_directory_tools",
      description: "List every tool in the tools directory, any status.",
      inputSchema: {},
      handler: async () => call("/api/v1/directory/tools"),
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
      handler: async (args) => call("/api/v1/directory/tools", { method: "POST", body: JSON.stringify(args) }),
    },
  ];
}
