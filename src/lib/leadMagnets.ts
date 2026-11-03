import { pool } from "@/lib/db";

export type LeadMagnet = {
  id: number;
  slug: string;
  title: string;
  headline: string;
  subheadline: string | null;
  cover_image_url: string | null;
  file_url: string | null;
  published: boolean;
  created_at: Date;
  updated_at: Date;
};

/** The one guide currently promoted on the homepage popup -- the most
 * recently created published one. Several could exist (the console lets
 * the owner keep old ones around unpublished), only one is ever offered
 * at a time. */
export async function getActiveLeadMagnet(): Promise<LeadMagnet | null> {
  const result = await pool.query<LeadMagnet>(
    "SELECT * FROM lead_magnets WHERE published = true ORDER BY created_at DESC LIMIT 1",
  );
  return result.rows[0] ?? null;
}

export async function getLeadMagnetBySlug(slug: string): Promise<LeadMagnet | null> {
  const result = await pool.query<LeadMagnet>("SELECT * FROM lead_magnets WHERE slug = $1", [slug]);
  return result.rows[0] ?? null;
}

export async function getLeadMagnetById(id: number): Promise<LeadMagnet | null> {
  const result = await pool.query<LeadMagnet>("SELECT * FROM lead_magnets WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function listLeadMagnets(): Promise<LeadMagnet[]> {
  const result = await pool.query<LeadMagnet>("SELECT * FROM lead_magnets ORDER BY created_at DESC");
  return result.rows;
}
