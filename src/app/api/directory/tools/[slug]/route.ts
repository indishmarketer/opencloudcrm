import { NextResponse } from "next/server";
import { getPublishedToolBySlug } from "@/lib/directory";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = await getPublishedToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ tool });
}
