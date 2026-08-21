import { getSeriesBySlug } from "@/lib/content";
import { bunnyPublicStorageConfigured, bunnyStoragePublicPullZoneUrl } from "@/lib/bunny";

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
  // memberOnly is filtered explicitly: publishedNow() (which is what loaded
  // these files) only gates published/hidden/scheduled/trashed, never
  // audience. Without it a members-only audio file inside an otherwise-public
  // series is listed as an episode in a world-readable RSS feed.
  //
  // The publicPath condition is the real gate when a public storage zone is
  // configured: an episode appears only once its bytes have actually been
  // copied there, so the feed can never advertise a URL that isn't live.
  // Where no public zone is set up, publicPath is always null and the feed
  // falls back to the app's own gated route below.
  const publicZone = bunnyPublicStorageConfigured();
  const episodes = series.files.filter(
    (f) => f.mimeType?.startsWith("audio/") && !f.memberOnly && (!publicZone || f.publicPath),
  );

  const items = episodes
    .map((f) => {
      // The enclosure URL is computed fresh (never a stored value) so a
      // corrected hostname takes effect immediately; the guid is the file's
      // own stable id, decoupled from that URL, so podcast apps never see an
      // episode as "new" just because a hostname changed.
      //
      // With a public zone configured, this is a CDN URL built from
      // publicPath — a location proven to hold bytes — and never from
      // bunnyPath, so a private object's path is never guessable from a
      // public one.
      //
      // Without one, it falls back to the app's own gated route. Podcast
      // apps can't authenticate, so that route has to answer them
      // anonymously, and it does: canViewFile() returns true for a public
      // file in a public series precisely so this works. The trade is that
      // the app route stops serving the moment a series is marked
      // members-only, where a CDN URL keeps working until the mirror is
      // deleted — and even then, only for new listeners.
      const url =
        (f.publicPath ? bunnyStoragePublicPullZoneUrl(f.publicPath) : null) ??
        `${baseUrl}/api/files/${f.id}/content`;
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
