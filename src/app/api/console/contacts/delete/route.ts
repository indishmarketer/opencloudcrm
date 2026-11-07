import { NextResponse } from "next/server";
import { pool, withTransaction } from "@/lib/db";
import { getAdminSessionEmail } from "@/lib/auth";
import { extractR2ImageUrls } from "@/lib/extractImageUrls";
import { deleteFromR2 } from "@/lib/r2Upload";

export async function POST(req: Request) {
  try {
    const adminEmail = await getAdminSessionEmail();
    if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { keys } = await req.json();
    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ error: "No keys provided" }, { status: 400 });
    }

    const userIds: number[] = [];
    const guestEmails: string[] = [];
    const contactIds: number[] = [];

    for (const k of keys) {
      if (typeof k !== "string") continue;
      if (k.startsWith("c-")) contactIds.push(parseInt(k.slice(2), 10));
      else if (k.startsWith("u-")) userIds.push(parseInt(k.slice(2), 10));
      else if (k.startsWith("g-")) guestEmails.push(decodeURIComponent(k.slice(2)));
    }

    if (contactIds.length > 0) {
      const selected = await pool.query(
        "SELECT user_id, email FROM contacts WHERE id = ANY($1::bigint[])",
        [contactIds],
      );
      for (const row of selected.rows) {
        if (row.user_id) userIds.push(Number(row.user_id));
        guestEmails.push(row.email);
      }
    }

    // Deleting a user cascades to their forum_posts/review_submissions/
    // avatar reference, so collect every R2 image those rows carry
    // before the transaction wipes the rows that point to them.
    const r2UrlsToClean: string[] = [];
    if (userIds.length > 0) {
      const [avatars, posts, reviews] = await Promise.all([
        pool.query("SELECT avatar_url FROM users WHERE id = ANY($1::int[]) AND avatar_url IS NOT NULL", [userIds]),
        pool.query("SELECT body FROM forum_posts WHERE user_id = ANY($1::int[])", [userIds]),
        pool.query("SELECT screenshots FROM review_submissions WHERE user_id = ANY($1::int[])", [userIds]),
      ]);
      for (const row of avatars.rows) r2UrlsToClean.push(row.avatar_url);
      for (const row of posts.rows) r2UrlsToClean.push(...extractR2ImageUrls(row.body));
      for (const row of reviews.rows) r2UrlsToClean.push(...(row.screenshots || []));
    }

    await withTransaction(async (client) => {
      // 1. Delete user-based records that lack ON DELETE CASCADE
      if (userIds.length > 0) {
        await client.query(`DELETE FROM product_leads WHERE user_id = ANY($1::int[])`, [userIds]);
        // Also remove them from newsletter and contact submissions just to be thorough (though schema says ON DELETE SET NULL)
        await client.query(`DELETE FROM newsletter_subscribers WHERE user_id = ANY($1::int[])`, [userIds]);
        await client.query(`DELETE FROM contact_submissions WHERE user_id = ANY($1::int[])`, [userIds]);
        
        // Find their emails to delete from guest tables just in case they were mismatched
        const emailsRes = await client.query(`SELECT email FROM users WHERE id = ANY($1::int[])`, [userIds]);
        const matchedEmails = emailsRes.rows.map(r => r.email);
        if (matchedEmails.length > 0) {
          await client.query(`DELETE FROM newsletter_subscribers WHERE email = ANY($1::text[])`, [matchedEmails]);
          await client.query(`DELETE FROM contact_submissions WHERE email = ANY($1::text[])`, [matchedEmails]);
        }

        // Finally, delete the users themselves (cascades to enrollments, community, progress, etc.)
        await client.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [userIds]);
      }

      // 2. Delete guest-based records
      if (guestEmails.length > 0) {
        await client.query(`DELETE FROM newsletter_subscribers WHERE email = ANY($1::text[])`, [guestEmails]);
        await client.query(`DELETE FROM contact_submissions WHERE email = ANY($1::text[])`, [guestEmails]);
        await client.query(`DELETE FROM attribution_events WHERE lower(trim(email)) = ANY($1::text[])`, [guestEmails.map((email) => email.toLowerCase())]);
        await client.query(`DELETE FROM email_events WHERE lower(trim(recipient_email)) = ANY($1::text[])`, [guestEmails.map((email) => email.toLowerCase())]);
        await client.query(`DELETE FROM email_deliveries WHERE lower(trim(recipient_email)) = ANY($1::text[])`, [guestEmails.map((email) => email.toLowerCase())]);
        await client.query(`DELETE FROM email_suppressions WHERE lower(trim(email)) = ANY($1::text[])`, [guestEmails.map((email) => email.toLowerCase())]);
      }

      if (contactIds.length > 0) {
        await client.query("DELETE FROM contacts WHERE id = ANY($1::bigint[])", [contactIds]);
      }

    });

    await Promise.allSettled(r2UrlsToClean.map((url) => deleteFromR2(url)));
    return NextResponse.json({ ok: true, deleted: keys.length });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return NextResponse.json({ error: "Failed to delete contacts" }, { status: 500 });
  }
}
