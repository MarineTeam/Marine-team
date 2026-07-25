import { getSeriesBySlug } from "@/lib/content";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await getSeriesBySlug(slug);

  if (!series || series.memberOnly) {
    return new Response("Not found", { status: 404 });
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const episodes = series.files.filter((f) => f.mimeType?.startsWith("audio/"));

  const items = episodes
    .map(
      (f) => `
    <item>
      <title>${escapeXml(f.title)}</title>
      <guid>${f.url}</guid>
      <enclosure url="${f.url}" type="${f.mimeType}" ${f.sizeBytes ? `length="${f.sizeBytes}"` : ""}/>
    </item>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${escapeXml(series.title)}</title>
    <link>${baseUrl}/series/${series.slug}</link>
    ${series.description ? `<description>${escapeXml(series.description)}</description>` : ""}${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
