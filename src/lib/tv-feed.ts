import type { Video } from "@prisma/client";

/**
 * The catalogue a television platform ingests.
 *
 * This is the part of "a TV app" that needs no native code at all. Roku's
 * Direct Publisher builds and ships a real channel from a JSON feed in this
 * shape; several smart-TV platforms and search integrations take the MRSS
 * version of the same thing. A church gets a channel on the television without
 * anybody writing BrightScript.
 *
 * One rule governs everything here, and it is not negotiable: **a feed is
 * fetched by somebody else's server, with no session, and is then cached and
 * republished by them.** Nothing member-only can go in it. There is no way to
 * put a login in front of a feed Roku's crawler reads, so the only safe
 * reading of "who can see this" is "the entire internet".
 */

export type FeedVideo = Pick<
  Video,
  | "id"
  | "slug"
  | "title"
  | "description"
  | "durationSeconds"
  | "source"
  | "externalId"
  | "externalUrl"
  | "createdAt"
  | "publishAt"
  | "language"
> & { thumbnailUrl: string; seriesTitle: string | null; speakerName: string | null };

/** Roku wants a whole number of seconds and refuses an item without one. */
export function feedDuration(seconds: number | null): number {
  return seconds && seconds > 0 ? Math.round(seconds) : 0;
}

/** ISO 8601 date only, which is what both formats want for a release date. */
export function feedDate(video: Pick<FeedVideo, "publishAt" | "createdAt">): string {
  return (video.publishAt ?? video.createdAt).toISOString().slice(0, 10);
}

/**
 * Whether an item can go in a feed at all.
 *
 * Two reasons one can't, and they are different: a video with no playable URL
 * of its own is useless to a television, and an item with no duration is
 * rejected outright by Roku's validator - better to leave it out than to have
 * the whole feed refused because of one row.
 */
export function isFeedable(video: FeedVideo): boolean {
  if (feedDuration(video.durationSeconds) <= 0) return false;
  // A Bunny video plays through this app's own page; an imported one is
  // already a public URL somewhere else.
  return video.source === "BUNNY" || Boolean(video.externalUrl);
}

export type RokuFeed = {
  providerName: string;
  lastUpdated: string;
  language: string;
  shortFormVideos: {
    id: string;
    title: string;
    content: { dateAdded: string; duration: number; videos: { url: string; quality: string; videoType: string }[] };
    thumbnail: string;
    shortDescription: string;
    releaseDate: string;
    tags?: string[];
  }[];
};

/**
 * The JSON Roku's Direct Publisher reads.
 *
 * `shortFormVideos` regardless of length: the alternatives (`series`,
 * `movies`) carry obligations about seasons and ratings that a sermon archive
 * cannot meet honestly, and Roku treats this category as the general one.
 *
 * The description is trimmed to Roku's limit rather than sent long and
 * truncated by them mid-word, and falls back to the title - an empty
 * `shortDescription` fails their validation and takes the whole feed with it.
 */
export function rokuFeed(
  videos: readonly FeedVideo[],
  options: { providerName: string; baseUrl: string; language: string; now?: Date },
): RokuFeed {
  return {
    providerName: options.providerName,
    lastUpdated: (options.now ?? new Date()).toISOString(),
    language: options.language,
    shortFormVideos: videos.filter(isFeedable).map((video) => ({
      id: video.id,
      title: video.title.slice(0, 100),
      content: {
        dateAdded: (video.publishAt ?? video.createdAt).toISOString(),
        duration: feedDuration(video.durationSeconds),
        videos: [
          {
            url: video.externalUrl ?? `${options.baseUrl}/videos/${video.slug}`,
            quality: "HD",
            videoType: video.source === "BUNNY" ? "HLS" : "MP4",
          },
        ],
      },
      thumbnail: video.thumbnailUrl,
      shortDescription: (video.description?.trim() || video.title).slice(0, 200),
      releaseDate: feedDate(video),
      tags: [video.seriesTitle, video.speakerName].filter((tag): tag is string => Boolean(tag)),
    })),
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The same catalogue as MRSS, which is what most other platforms take.
 *
 * Deliberately generated from the same list as the JSON, so a church cannot
 * end up with a Roku channel and a smart-TV app disagreeing about what exists.
 */
export function mrssFeed(
  videos: readonly FeedVideo[],
  options: { providerName: string; baseUrl: string; now?: Date },
): string {
  const items = videos
    .filter(isFeedable)
    .map((video) => {
      const url = video.externalUrl ?? `${options.baseUrl}/videos/${video.slug}`;
      return `
    <item>
      <title>${escapeXml(video.title)}</title>
      <link>${escapeXml(`${options.baseUrl}/videos/${video.slug}`)}</link>
      <guid isPermaLink="false">${escapeXml(video.id)}</guid>
      <pubDate>${(video.publishAt ?? video.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(video.description?.trim() || video.title)}</description>
      <media:content url="${escapeXml(url)}" medium="video" duration="${feedDuration(video.durationSeconds)}"${video.language ? ` lang="${escapeXml(video.language)}"` : ""} />
      <media:thumbnail url="${escapeXml(video.thumbnailUrl)}" />
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(options.providerName)}</title>
    <link>${escapeXml(options.baseUrl)}</link>
    <description>${escapeXml(options.providerName)}</description>
    <lastBuildDate>${(options.now ?? new Date()).toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>`;
}
