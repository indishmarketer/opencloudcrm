import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getUnpublishedDrafts } from "@/lib/blogPosts";
import { searchConsolePages } from "@/lib/consolePageSearch";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchResult = { title: string; href: string; section: string; detail?: string };

export async function GET(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim().slice(0, 120);
  if (query.length < 2) return NextResponse.json({ results: [] });
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;

  const lookups = await Promise.allSettled([
    pool.query<{ id: string; name: string | null; email: string; phone: string | null }>(
      `SELECT id, name, email, phone FROM contacts
       WHERE concat_ws(' ', name, email, phone) ILIKE $1 ESCAPE '\\'
       ORDER BY updated_at DESC LIMIT 8`, [pattern]),
    pool.query<{ id: number; title: string }>(
      "SELECT id, title FROM courses WHERE title ILIKE $1 ORDER BY created_at DESC LIMIT 6", [pattern]),
    pool.query<{ slug: string; name: string; tagline: string | null }>(
      "SELECT slug, name, tagline FROM directory_tools WHERE concat_ws(' ', name, tagline, slug) ILIKE $1 ORDER BY name LIMIT 6", [pattern]),
    pool.query<{ id: number; name: string; slug: string }>(
      "SELECT id, name, slug FROM directory_categories WHERE concat_ws(' ', name, slug) ILIKE $1 ORDER BY sort_order, name LIMIT 5", [pattern]),
    pool.query<{ id: number; label: string; scopes: string[] }>(
      "SELECT id, label, scopes FROM api_tokens WHERE concat_ws(' ', label, array_to_string(scopes, ' ')) ILIKE $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 4", [pattern]),
    pool.query<{ key: string; label: string; category: string }>(
      "SELECT key, label, category FROM email_templates WHERE concat_ws(' ', label, category, key) ILIKE $1 ORDER BY category, label LIMIT 6", [pattern]),
    pool.query<{ id: number; subject: string; status: string }>(
      "SELECT id, subject, status FROM newsletter_campaigns WHERE concat_ws(' ', subject, status) ILIKE $1 ORDER BY created_at DESC LIMIT 6", [pattern]),
    pool.query<{ id: number; name: string }>(
      "SELECT id, name FROM automation_workflows WHERE name ILIKE $1 AND archived_at IS NULL ORDER BY name LIMIT 8", [pattern]),
    pool.query<{ id: number; name: string; email: string; status: string }>(
      `SELECT aa.id, u.name, u.email, aa.status FROM author_applications aa
       JOIN users u ON u.id = aa.user_id
       WHERE concat_ws(' ', u.name, u.email, aa.topics, aa.status) ILIKE $1
       ORDER BY aa.created_at DESC LIMIT 6`, [pattern]),
    pool.query<{ slug: string; title: string; status: string }>(
      "SELECT slug, title, status FROM webinars WHERE concat_ws(' ', title, slug, status) ILIKE $1 ORDER BY created_at DESC LIMIT 5", [pattern]),
    pool.query<{ id: number; name: string; slug: string }>(
      "SELECT id, name, slug FROM meeting_types WHERE concat_ws(' ', name, slug) ILIKE $1 ORDER BY name LIMIT 5", [pattern]),
  ]);

  const results: SearchResult[] = [];
  const rows = (index: number) => lookups[index].status === "fulfilled" ? lookups[index].value.rows : [];
  for (const contact of rows(0) as { id: string; name: string | null; email: string; phone: string | null }[]) {
    results.push({ title: contact.name || contact.email, href: `/console/contacts/c-${contact.id}`, section: "Contact", detail: [contact.email, contact.phone].filter(Boolean).join(" · ") });
  }
  for (const course of rows(1) as { id: number; title: string }[]) results.push({ title: course.title, href: `/console/courses/${course.id}`, section: "Course" });
  for (const tool of rows(2) as { slug: string; name: string; tagline: string | null }[]) results.push({ title: tool.name, href: `/console/directory?tab=tools`, section: "Directory tool", detail: tool.tagline || tool.slug });
  for (const category of rows(3) as { id: number; name: string; slug: string }[]) results.push({ title: category.name, href: "/console/directory?tab=categories", section: "Directory category", detail: category.slug });
  for (const token of rows(4) as { id: number; label: string; scopes: string[] }[]) results.push({ title: token.label, href: "/console/api-tokens", section: "API token", detail: token.scopes.join(", ") });
  for (const template of rows(5) as { key: string; label: string; category: string }[]) results.push({ title: template.label, href: "/console/email/templates", section: "Email template", detail: template.category });
  for (const campaign of rows(6) as { id: number; subject: string; status: string }[]) results.push({ title: campaign.subject, href: `/console/email/campaigns/${campaign.id}`, section: "Email campaign", detail: campaign.status });
  for (const workflow of rows(7) as { id: number; name: string }[]) results.push({ title: workflow.name, href: `/console/workflows/${workflow.id}`, section: "Workflow" });
  for (const application of rows(8) as { id: number; name: string; email: string; status: string }[]) results.push({ title: application.name || application.email, href: "/console/blog/applications", section: "Author application", detail: application.status });
  for (const webinar of rows(9) as { slug: string; title: string; status: string }[]) results.push({ title: webinar.title, href: "/console/webinars", section: "Webinar", detail: webinar.status });
  for (const meetingType of rows(10) as { id: number; name: string; slug: string }[]) results.push({ title: meetingType.name, href: "/console/meetings/types", section: "Meeting type", detail: meetingType.slug });

  for (const post of await getUnpublishedDrafts()) {
    if (`${post.title} ${post.slug} ${post.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
      results.push({ title: post.title, href: "/console/blog", section: "Blog draft", detail: post.category });
    }
  }

  const pages = searchConsolePages(query, 12);
  return NextResponse.json({ results: [...pages, ...results].slice(0, 30) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
