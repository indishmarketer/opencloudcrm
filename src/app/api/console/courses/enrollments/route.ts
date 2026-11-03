import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { findOrCreateAccount, grantCourseManually } from "@/lib/courseGrant";

/** Grants a course from the console. The student can be named by account
 * (userId), by contact (contactId) or by email. A contact or email with no
 * account gets one made for them, so the owner can give access to anyone
 * in Contacts, not only people who already signed up. */
export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { courseId, tier } = body;
  if (!Number.isInteger(courseId) || !["free", "pro"].includes(tier)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const courseResult = await pool.query("SELECT id, slug, title FROM courses WHERE id = $1", [courseId]);
  const course = courseResult.rows[0];
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  let email = "";
  let name: string | null = null;
  if (Number.isInteger(body.userId)) {
    const u = await pool.query("SELECT email, name FROM users WHERE id = $1", [body.userId]);
    if (!u.rows[0]) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    email = u.rows[0].email;
    name = u.rows[0].name;
  } else if (Number.isInteger(body.contactId)) {
    const c = await pool.query(
      "SELECT c.email, COALESCE(u.name, c.name) AS name FROM contacts c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1",
      [body.contactId],
    );
    if (!c.rows[0]) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    email = c.rows[0].email;
    name = c.rows[0].name;
  } else {
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const c = await pool.query("SELECT name FROM contacts WHERE normalized_email = $1", [email]);
    name = c.rows[0]?.name ?? null;
  }

  const account = await findOrCreateAccount(email, name);
  const { emailed } = await grantCourseManually(account, course, tier);

  return NextResponse.json({ ok: true, userId: account.id, createdAccount: account.created, emailed });
}
