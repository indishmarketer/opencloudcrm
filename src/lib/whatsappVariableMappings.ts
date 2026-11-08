import { pool } from "@/lib/db";
import { getPublicPosts } from "@/lib/blogPosts";
import { calVideoUrl } from "@/lib/calcom";
import { SITE_URL, emailAt } from "@/lib/liveSiteUrl";

export type WhatsAppVariableMapping = {
  position: number;
  sourceKey: string;
  fixedValue?: string | null;
};

export type WhatsAppVariableSource = {
  key: string;
  label: string;
  group: string;
  /** Set for an internal resource whose value is fixed for everyone receiving this template. */
  value?: string;
  /** Realistic sample value for Meta template approval review. */
  exampleValue?: string;
  kind: "contact" | "activity" | "resource" | "custom";
};

const DYNAMIC_SOURCES: WhatsAppVariableSource[] = [
  { key: "contact.first_name", label: "First name", group: "Contact", kind: "contact" },
  { key: "contact.last_name", label: "Last name", group: "Contact", kind: "contact" },
  { key: "contact.full_name", label: "Full name", group: "Contact", kind: "contact" },
  { key: "contact.email", label: "Email", group: "Contact", kind: "contact" },
  { key: "contact.phone", label: "Phone", group: "Contact", kind: "contact" },
  { key: "contact.country", label: "Country", group: "Contact", kind: "contact" },
  { key: "booking.meeting_name", label: "Most recent booking · meeting name", group: "Bookings & events", kind: "activity" },
  { key: "booking.scheduled_datetime", label: "Most recent booking · date and time", group: "Bookings & events", kind: "activity" },
  { key: "booking.timezone", label: "Most recent booking · time zone", group: "Bookings & events", kind: "activity" },
  { key: "booking.join_link", label: "Most recent booking · meeting link", group: "Bookings & events", kind: "activity" },
  { key: "booking.booking_page", label: "Most recent booking · booking page", group: "Bookings & events", kind: "activity" },
  { key: "purchase.course_title", label: "Most recent purchase · course name", group: "Purchase & access", kind: "activity" },
  { key: "purchase.access_link", label: "Most recent purchase · course access link", group: "Purchase & access", kind: "activity" },
  { key: "purchase.payment_id", label: "Most recent purchase · payment ID", group: "Purchase & access", kind: "activity" },
  { key: "purchase.amount", label: "Most recent purchase · amount", group: "Purchase & access", kind: "activity" },
  { key: "purchase.currency", label: "Most recent purchase · currency", group: "Purchase & access", kind: "activity" },
  { key: "purchase.method", label: "Most recent purchase · payment method", group: "Purchase & access", kind: "activity" },
  { key: "course.latest_title", label: "Most recent enrollment · course name", group: "Courses & access", kind: "activity" },
  { key: "course.latest_access_link", label: "Most recent enrollment · access link", group: "Courses & access", kind: "activity" },
  { key: "webinar.title", label: "Most recent webinar registration · title", group: "Webinars", kind: "activity" },
  { key: "webinar.link", label: "Most recent webinar registration · link", group: "Webinars", kind: "activity" },
  { key: "review.google_review_url", label: "Official Google review link", group: "Reviews", kind: "resource" },
  { key: "custom", label: "Custom fixed text or URL", group: "Custom / external", kind: "custom" },
];

/** The editor's dynamic CRM fields plus live internal content. Search/filter is
 * done in the editor, while the list itself always reflects current published
 * records so future courses, posts, webinars, tools, guides, and prompts appear
 * without a code change. Realistic example values are pre-calculated for each
 * source so template submission to Meta is immediate and requires zero manual typing. */
export async function listWhatsAppVariableSources(): Promise<WhatsAppVariableSource[]> {
  const [courses, webinars, tools, guides, prompts, posts, sampleContactRes, sampleMeetingRes] = await Promise.all([
    pool.query<{ id: number; title: string; slug: string }>("SELECT id, title, slug FROM courses WHERE published = true ORDER BY title"),
    pool.query<{ id: number; title: string; slug: string }>("SELECT id, title, slug FROM webinars WHERE status = 'published' ORDER BY title"),
    pool.query<{ id: number; name: string; slug: string; category_slug: string }>("SELECT t.id, t.name, t.slug, c.slug AS category_slug FROM directory_tools t JOIN directory_categories c ON c.id = t.category_id WHERE t.status = 'published' ORDER BY t.name"),
    pool.query<{ id: number; title: string; slug: string }>("SELECT id, title, slug FROM lead_magnets WHERE published = true ORDER BY title"),
    pool.query<{ id: number; title: string; slug: string; category: string }>(
      `SELECT p.id, p.title, p.slug, pc.name AS category FROM prompts p JOIN prompt_categories pc ON pc.id = p.category_id WHERE p.status = 'published' ORDER BY pc.sort_order, p.title`,
    ),
    getPublicPosts(),
    pool.query<{ name: string | null; email: string | null; phone: string | null; country: string | null }>(
      "SELECT name, email, phone, country FROM contacts WHERE name IS NOT NULL AND trim(name) != '' ORDER BY id DESC LIMIT 1",
    ).catch(() => ({ rows: [] })),
    pool.query<{ name: string; slug: string }>(
      "SELECT name, slug FROM meeting_types WHERE active = true ORDER BY id ASC LIMIT 1",
    ).catch(() => ({ rows: [] })),
  ]);

  const sampleContact = sampleContactRes.rows[0];
  const sampleFullName = (sampleContact?.name || "Jordan Smith").trim();
  const sampleParts = sampleFullName.split(/\s+/).filter(Boolean);
  const sampleFirstName = sampleParts[0] || "Jordan";
  const sampleLastName = sampleParts.slice(1).join(" ") || "Smith";
  const sampleEmail = sampleContact?.email || emailAt("sample");
  const samplePhone = sampleContact?.phone || "+919876543210";
  const sampleCountry = sampleContact?.country || "India";

  const sampleMeeting = sampleMeetingRes.rows[0];
  const meetingName = sampleMeeting?.name || "Strategy Consultation";
  const meetingSlug = sampleMeeting?.slug || "strategy-consultation";

  const firstCourse = courses.rows[0];
  const courseTitle = firstCourse?.title || "Full Stack Marketing Masterclass";
  const courseSlug = firstCourse?.slug || "full-stack-marketing";

  const firstWebinar = webinars.rows[0];
  const webinarTitle = firstWebinar?.title || "AI Marketing Masterclass";
  const webinarSlug = firstWebinar?.slug || "ai-marketing-masterclass";

  const dynamicExamples: Record<string, string> = {
    "contact.first_name": sampleFirstName,
    "contact.last_name": sampleLastName,
    "contact.full_name": sampleFullName,
    "contact.email": sampleEmail,
    "contact.phone": samplePhone,
    "contact.country": sampleCountry,
    "booking.meeting_name": meetingName,
    "booking.scheduled_datetime": "Monday, 10 Nov at 3:00 PM",
    "booking.timezone": "Asia/Kolkata",
    "booking.join_link": "https://meet.jit.si/indish-meeting-preview",
    "booking.booking_page": `${SITE_URL}/book/${meetingSlug}`,
    "purchase.course_title": courseTitle,
    "purchase.access_link": `${SITE_URL}/account/courses/${courseSlug}`,
    "purchase.payment_id": "pay_N9xK238192",
    "purchase.amount": "4999",
    "purchase.currency": "INR",
    "purchase.method": "UPI",
    "course.latest_title": courseTitle,
    "course.latest_access_link": `${SITE_URL}/account/courses/${courseSlug}`,
    "webinar.title": webinarTitle,
    "webinar.link": `${SITE_URL}/webinars/${webinarSlug}`,
    "review.google_review_url": "https://g.page/r/example/review",
    "custom": "",
  };

  const options: WhatsAppVariableSource[] = DYNAMIC_SOURCES.map((source) => ({
    ...source,
    exampleValue: dynamicExamples[source.key] || "",
  }));

  for (const row of courses.rows) {
    options.push({ key: `resource.course.${row.id}.title`, label: row.title, group: "Courses · title", value: row.title, exampleValue: row.title, kind: "resource" });
    options.push({ key: `resource.course.${row.id}.link`, label: `${row.title} · course page`, group: "Courses · links", value: `${SITE_URL}/courses/${row.slug}`, exampleValue: `${SITE_URL}/courses/${row.slug}`, kind: "resource" });
    options.push({ key: `resource.course.${row.id}.access`, label: `${row.title} · access page`, group: "Courses · links", value: `${SITE_URL}/account/courses/${row.slug}`, exampleValue: `${SITE_URL}/account/courses/${row.slug}`, kind: "resource" });
  }
  for (const row of posts) {
    options.push({ key: `resource.blog.${row.slug}.title`, label: row.title, group: "Blog posts · title", value: row.title, exampleValue: row.title, kind: "resource" });
    options.push({ key: `resource.blog.${row.slug}.link`, label: row.title, group: "Blog posts · links", value: `${SITE_URL}/blog/${row.slug}`, exampleValue: `${SITE_URL}/blog/${row.slug}`, kind: "resource" });
  }
  for (const row of webinars.rows) {
    options.push({ key: `resource.webinar.${row.id}.title`, label: row.title, group: "Webinars · title", value: row.title, exampleValue: row.title, kind: "resource" });
    options.push({ key: `resource.webinar.${row.id}.link`, label: row.title, group: "Webinars · links", value: `${SITE_URL}/webinars/${row.slug}`, exampleValue: `${SITE_URL}/webinars/${row.slug}`, kind: "resource" });
  }
  for (const row of tools.rows) {
    options.push({ key: `resource.tool.${row.id}.title`, label: row.name, group: "Tools · title", value: row.name, exampleValue: row.name, kind: "resource" });
    options.push({ key: `resource.tool.${row.id}.link`, label: row.name, group: "Tools · links", value: `${SITE_URL}/tools/${row.category_slug}/${row.slug}`, exampleValue: `${SITE_URL}/tools/${row.category_slug}/${row.slug}`, kind: "resource" });
  }
  for (const row of guides.rows) {
    options.push({ key: `resource.guide.${row.id}.title`, label: row.title, group: "Guides · title", value: row.title, exampleValue: row.title, kind: "resource" });
    options.push({ key: `resource.guide.${row.id}.link`, label: row.title, group: "Guides · links", value: `${SITE_URL}/resources/prompt-skill-library/guides/${row.slug}`, exampleValue: `${SITE_URL}/resources/prompt-skill-library/guides/${row.slug}`, kind: "resource" });
  }
  for (const row of prompts.rows) {
    options.push({ key: `resource.prompt.${row.id}.title`, label: row.title, group: `Prompt library · ${row.category}`, value: row.title, exampleValue: row.title, kind: "resource" });
    options.push({ key: `resource.prompt.${row.id}.link`, label: row.title, group: `Prompt library · ${row.category}`, value: `${SITE_URL}/resources/prompt-skill-library/browse/prompts/${row.slug}`, exampleValue: `${SITE_URL}/resources/prompt-skill-library/browse/prompts/${row.slug}`, kind: "resource" });
  }
  return options;
}

export async function getWhatsAppVariableMappings(templateName: string): Promise<WhatsAppVariableMapping[]> {
  const result = await pool.query<{ variable_position: number; source_key: string; fixed_value: string | null }>(
    "SELECT variable_position, source_key, fixed_value FROM whatsapp_template_variable_mappings WHERE template_name = $1 ORDER BY variable_position",
    [templateName],
  );
  return result.rows.map((row) => ({ position: row.variable_position, sourceKey: row.source_key, fixedValue: row.fixed_value }));
}

export async function saveWhatsAppVariableMappings(templateName: string, mappings: WhatsAppVariableMapping[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM whatsapp_template_variable_mappings WHERE template_name = $1", [templateName]);
    for (const mapping of mappings) {
      await client.query(
        `INSERT INTO whatsapp_template_variable_mappings (template_name, variable_position, source_key, fixed_value)
         VALUES ($1, $2, $3, $4)`,
        [templateName, mapping.position, mapping.sourceKey, mapping.fixedValue || null],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveWhatsAppVariableMappings(
  templateName: string,
  contactId: number | null,
  overrides: Record<string, string> = {},
): Promise<string[]> {
  const mappings = await getWhatsAppVariableMappings(templateName);
  if (!mappings.length) return [];
  const context = contactId === null ? { rows: [] as Record<string, unknown>[] } : await pool.query<Record<string, unknown>>(
    `SELECT c.name, c.email, c.phone, c.country, c.user_id,
       (SELECT mt.name FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id
        WHERE (mb.contact_id = c.id OR lower(mb.attendee_email) = lower(c.email)) AND mb.status IN ('confirmed','completed')
        ORDER BY mb.created_at DESC, mb.id DESC LIMIT 1) AS meeting_name,
       (SELECT mb.scheduled_start FROM meeting_bookings mb
        WHERE (mb.contact_id = c.id OR lower(mb.attendee_email) = lower(c.email)) AND mb.status IN ('confirmed','completed')
        ORDER BY mb.created_at DESC, mb.id DESC LIMIT 1) AS meeting_start,
       (SELECT mb.attendee_timezone FROM meeting_bookings mb
        WHERE (mb.contact_id = c.id OR lower(mb.attendee_email) = lower(c.email)) AND mb.status IN ('confirmed','completed')
        ORDER BY mb.created_at DESC, mb.id DESC LIMIT 1) AS meeting_timezone,
       (SELECT mb.calcom_booking_uid FROM meeting_bookings mb
        WHERE (mb.contact_id = c.id OR lower(mb.attendee_email) = lower(c.email)) AND mb.status IN ('confirmed','completed')
        ORDER BY mb.created_at DESC, mb.id DESC LIMIT 1) AS meeting_uid,
       (SELECT mt.slug FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id
        WHERE (mb.contact_id = c.id OR lower(mb.attendee_email) = lower(c.email)) AND mb.status IN ('confirmed','completed')
        ORDER BY mb.created_at DESC, mb.id DESC LIMIT 1) AS meeting_slug,
       (SELECT co.title FROM payment_claims pc JOIN courses co ON co.id = pc.course_id
        WHERE pc.user_id = c.user_id AND pc.status = 'approved' ORDER BY pc.reviewed_at DESC NULLS LAST, pc.id DESC LIMIT 1) AS purchase_course_title,
       (SELECT co.slug FROM payment_claims pc JOIN courses co ON co.id = pc.course_id
        WHERE pc.user_id = c.user_id AND pc.status = 'approved' ORDER BY pc.reviewed_at DESC NULLS LAST, pc.id DESC LIMIT 1) AS purchase_course_slug,
       (SELECT pc.reference FROM payment_claims pc WHERE pc.user_id = c.user_id AND pc.status = 'approved' ORDER BY pc.reviewed_at DESC NULLS LAST, pc.id DESC LIMIT 1) AS payment_reference,
       (SELECT pc.amount::text FROM payment_claims pc WHERE pc.user_id = c.user_id AND pc.status = 'approved' ORDER BY pc.reviewed_at DESC NULLS LAST, pc.id DESC LIMIT 1) AS payment_amount,
       (SELECT pc.currency FROM payment_claims pc WHERE pc.user_id = c.user_id AND pc.status = 'approved' ORDER BY pc.reviewed_at DESC NULLS LAST, pc.id DESC LIMIT 1) AS payment_currency,
       (SELECT pc.method FROM payment_claims pc WHERE pc.user_id = c.user_id AND pc.status = 'approved' ORDER BY pc.reviewed_at DESC NULLS LAST, pc.id DESC LIMIT 1) AS payment_method,
       (SELECT co.title FROM course_enrollments ce JOIN courses co ON co.id = ce.course_id
        WHERE ce.user_id = c.user_id ORDER BY ce.created_at DESC, ce.id DESC LIMIT 1) AS latest_course_title,
       (SELECT co.slug FROM course_enrollments ce JOIN courses co ON co.id = ce.course_id
        WHERE ce.user_id = c.user_id ORDER BY ce.created_at DESC, ce.id DESC LIMIT 1) AS latest_course_slug,
       (SELECT w.title FROM webinar_access wa JOIN webinars w ON w.id = wa.webinar_id
        WHERE wa.user_id = c.user_id ORDER BY wa.registered_at DESC, wa.id DESC LIMIT 1) AS webinar_title,
       (SELECT w.slug FROM webinar_access wa JOIN webinars w ON w.id = wa.webinar_id
        WHERE wa.user_id = c.user_id ORDER BY wa.registered_at DESC, wa.id DESC LIMIT 1) AS webinar_slug,
       (SELECT value FROM site_settings WHERE key = 'google_review_url' LIMIT 1) AS google_review_url
     FROM contacts c WHERE c.id = $1 LIMIT 1`,
    [contactId],
  );
  const row = context.rows[0] || {};
  if (!contactId && !Object.keys(overrides).length && mappings.some((mapping) => mapping.sourceKey !== "custom" && !mapping.sourceKey.startsWith("resource."))) {
    throw new Error("This template needs contact or event data to fill its variables.");
  }
  const firstName = String(row.name || "").trim().split(/\s+/)[0] || "there";
  const nameParts = String(row.name || "").trim().split(/\s+/).filter(Boolean);
  const meetingStart = row.meeting_start ? new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full", timeStyle: "short", timeZone: String(row.meeting_timezone || "UTC"),
  }).format(new Date(String(row.meeting_start))) : "";
  const values: Record<string, string> = {
    "contact.first_name": firstName,
    "contact.last_name": nameParts.slice(1).join(" ") || firstName,
    "contact.full_name": String(row.name || "there"),
    "contact.email": String(row.email || ""),
    "contact.phone": String(row.phone || ""),
    "contact.country": String(row.country || ""),
    "booking.meeting_name": String(row.meeting_name || ""),
    "booking.scheduled_datetime": meetingStart,
    "booking.timezone": String(row.meeting_timezone || ""),
    "booking.join_link": row.meeting_uid ? calVideoUrl(String(row.meeting_uid)) : "",
    "booking.booking_page": row.meeting_slug ? `${SITE_URL}/book/${row.meeting_slug}` : "",
    "purchase.course_title": String(row.purchase_course_title || ""),
    "purchase.access_link": row.purchase_course_slug ? `${SITE_URL}/account/courses/${row.purchase_course_slug}` : "",
    "purchase.payment_id": String(row.payment_reference || ""),
    "purchase.amount": String(row.payment_amount || ""),
    "purchase.currency": String(row.payment_currency || ""),
    "purchase.method": String(row.payment_method || ""),
    "course.latest_title": String(row.latest_course_title || ""),
    "course.latest_access_link": row.latest_course_slug ? `${SITE_URL}/account/courses/${row.latest_course_slug}` : "",
    "webinar.title": String(row.webinar_title || ""),
    "webinar.link": row.webinar_slug ? `${SITE_URL}/webinars/${row.webinar_slug}` : "",
    "review.google_review_url": String(row.google_review_url || ""),
  };

  Object.assign(values, overrides);
  return mappings.map((mapping) => {
    if (mapping.sourceKey === "custom") return mapping.fixedValue || "";
    if (mapping.sourceKey.startsWith("resource.")) return mapping.fixedValue || "";
    const value = values[mapping.sourceKey];
    if (!value) throw new Error(`The template needs “${mapping.sourceKey}”, but this contact has no matching record.`);
    return value;
  });
}
