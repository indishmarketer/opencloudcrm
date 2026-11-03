import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2Upload";

const USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
const RESERVED_USERNAMES = new Set(["general", "pro", "admin", "settings", "leaderboard", "about", "invite", "members"]);
const ALLOWED_SOCIAL_KEYS = ["twitter", "linkedin", "instagram", "youtube", "website"];

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username, bio, avatarUrl, socialLinks } = await req.json();

  if (username !== undefined) {
    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: "Username must be 2-30 characters: lowercase letters, numbers, and hyphens only." },
        { status: 400 }
      );
    }
    if (RESERVED_USERNAMES.has(username)) {
      return NextResponse.json({ error: "That username is reserved." }, { status: 409 });
    }
    const existing = await pool.query("SELECT id FROM users WHERE username = $1 AND id != $2", [
      username,
      session.userId,
    ]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
  }

  let cleanSocialLinks: Record<string, string> | undefined;
  if (socialLinks !== undefined) {
    if (typeof socialLinks !== "object" || socialLinks === null || Array.isArray(socialLinks)) {
      return NextResponse.json({ error: "Invalid social links." }, { status: 400 });
    }
    cleanSocialLinks = {};
    for (const key of ALLOWED_SOCIAL_KEYS) {
      const value = socialLinks[key];
      if (typeof value === "string" && value.trim()) {
        cleanSocialLinks[key] = value.trim().slice(0, 300);
      }
    }
  }

  let previousAvatarUrl: string | null = null;
  if (avatarUrl) {
    const before = await pool.query("SELECT avatar_url FROM users WHERE id = $1", [session.userId]);
    previousAvatarUrl = before.rows[0]?.avatar_url || null;
  }

  await pool.query(
    `UPDATE users SET
       username = COALESCE($1, username),
       bio = COALESCE($2, bio),
       avatar_url = COALESCE($3, avatar_url),
       social_links = COALESCE($4, social_links)
     WHERE id = $5`,
    [
      username || null,
      bio !== undefined ? String(bio).slice(0, 1000) : null,
      avatarUrl || null,
      cleanSocialLinks !== undefined ? JSON.stringify(cleanSocialLinks) : null,
      session.userId,
    ]
  );

  if (previousAvatarUrl && previousAvatarUrl !== avatarUrl) {
    await deleteFromR2(previousAvatarUrl);
  }

  return NextResponse.json({ ok: true });
}
