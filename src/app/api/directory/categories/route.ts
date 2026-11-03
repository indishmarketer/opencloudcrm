import { NextResponse } from "next/server";
import { listCategories } from "@/lib/directory";

export async function GET() {
  const categories = await listCategories();
  return NextResponse.json({ categories });
}
