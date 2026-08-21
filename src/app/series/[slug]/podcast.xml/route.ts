import { getSeriesBySlug } from "@/lib/content";
import { bunnyStoragePublicPullZoneUrl } from "@/lib/bunny";

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
  // memberOnly is filtered here explicitly: publishedNow() (which is what
  // loaded these files) only gates published/hidden/scheduled/trashed, never
  // audience. Without this line a members-only audio file inside an
  // otherwise-public series is listed as an episode in a world-readable RSS
  // feed — its title leaking even though the enclosure URL itself now 403s
  // for an anonymous listener.
  const episodes = series.files.filter((f) => f.mimeType?.startsWith("audio/") && !f.memberOnly);

  const items = episodes
    .map((f) => {
      // The enclosure URL is computed fresh (never a stored value) so a
      // corrected hostname takes effect immediately; the guid is the file's
      // own stable id, decoupled from that URL, so podcast apps never see an
      // episode as "new" just because a hostname changed.
      //
      // By default this is the app's own content route, not a CDN link.
      // Podcast apps can't authenticate, so that route has to answer them
      // anonymously — and it does, because canViewFile() returns true for a
      // public file in a public series for exactly that reason. The payoff
      // is that it stops answering the moment this series is marked
      // members-only, which a permanent CDN URL never would.
      //
      // A church that wants CDN bandwidth for podcast audio can set
      // BUNNY_STORAGE_PUBLIC_PULL_ZONE_HOSTNAME to opt into a separate
      // unauthenticated pull zone; see bunnyStoragePublicPullZoneUrl for the
      // restriction that zone needs, and the revocation it gives up.
      const url = bunnyStoragePublicPullZoneUrl(f.bunnyPath) ?? `${baseUrl}/api/files/${f.id}/content`;
      return `
    <item>
      <title>${escapeXml(f.title)}</title>
      <guid isPermaLink="false">${f.id}</guid>
      <enclosure url="${url}" type="${f.mimeType}" ${f.sizeBytes ? `length="${f.sizeBytes}"` : ""}/>
    </item>`;
    })
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
