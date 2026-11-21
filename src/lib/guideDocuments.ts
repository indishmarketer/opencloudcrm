import { pool } from "@/lib/db";

export type GuideDocument = {
  id: number;
  title: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export async function getActiveGuideDocument(): Promise<GuideDocument | null> {
  const result = await pool.query<GuideDocument>(
    "SELECT * FROM guide_documents WHERE is_active = true LIMIT 1",
  );
  return result.rows[0] ?? null;
}

export async function getGuideDocumentById(id: number): Promise<GuideDocument | null> {
  const result = await pool.query<GuideDocument>("SELECT * FROM guide_documents WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function listGuideDocuments(): Promise<GuideDocument[]> {
  const result = await pool.query<GuideDocument>(
    "SELECT * FROM guide_documents ORDER BY is_active DESC, created_at DESC, id DESC",
  );
  return result.rows;
}
