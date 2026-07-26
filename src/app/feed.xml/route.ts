import { getRecentlyAddedSeries } from "@/lib/content";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const series = await getRecentlyAddedSeries(50, true);

  const items = series
    .map(
      (s) => `
    <item>
      <title>${escapeXml(s.title)}</title>
      <link>${baseUrl}/series/${s.slug}</link>
      <guid>${baseUrl}/series/${s.slug}</guid>
      <pubDate>${s.createdAt.toUTCString()}</pubDate>
      ${s.description ? `<description>${escapeXml(s.description)}</description>` : ""}
    </item>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Marine Team</title>
    <link>${baseUrl}</link>
    <description>Recently added series</description>${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
