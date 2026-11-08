import { NextRequest, NextResponse } from "next/server";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import { escapeHtml } from "@/lib/escapeHtml";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const theme = req.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark";
  const name = resolveSiteName(await getSiteIdentity());
  const shortName = name.length > 22 ? `${name.slice(0, 21)}…` : name;
  const foreground = theme === "light" ? "#111111" : "#ffffff";
  const background = theme === "light" ? "#ffffff" : "#111111";
  const border = theme === "light" ? "#d1d1cf" : "#393939";
  const safeName = escapeHtml(shortName);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="56" viewBox="0 0 200 56" role="img" aria-label="Featured on ${escapeHtml(name)}"><rect x="1" y="1" width="198" height="54" rx="10" fill="${background}" stroke="${border}" stroke-width="2"/><circle cx="25" cy="28" r="12" fill="#d73939"/><path d="m19 28 4 4 8-9" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><text x="47" y="23" font-family="Arial,sans-serif" font-size="10" fill="${foreground}">FEATURED ON</text><text x="47" y="39" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="${foreground}">${safeName}</text></svg>`;
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
