import type { VideoFeedKind } from "@prisma/client";
import { fingerprintLines } from "@/lib/fingerprint";

/**
 * Reading a YouTube channel or a Vimeo account.
 *
 * The same shape as `ScheduleProvider`: one interface, an implementation per
 * source, and nothing above this layer knowing which. Adding a third (a
 * podcast RSS feed, Facebook) means writing `fetchVideos` and nothing else.
 *
 * Unconfigured is a first-class state. A church with no YouTube API key gets a
 * screen that says which key is missing, not a sync that silently returns
 * nothing every night.
 */

/** One video as a source describes it, before this app knows anything about it. */
export type SourceVideo = {
  externalId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  durationSeconds: number | null;
};

export type FeedResult = {
  videos: SourceVideo[];
  /** Of the payload, so an unchanged feed does no writes at all. */
  fingerprint: string;
};

export class FeedError extends Error {}

export function youtubeKey(): string | null {
  return process.env.YOUTUBE_API_KEY ?? null;
}

export function vimeoToken(): string | null {
  return process.env.VIMEO_ACCESS_TOKEN ?? null;
}

/** What to tell an admin looking at a source that can't be read. */
export function feedUnavailableReason(kind: VideoFeedKind): string | null {
  if (kind.startsWith("YOUTUBE") && !youtubeKey()) {
    return "YouTube importing needs YOUTUBE_API_KEY — a Data API v3 key from the Google Cloud console.";
  }
  if (kind.startsWith("VIMEO") && !vimeoToken()) {
    return "Vimeo importing needs VIMEO_ACCESS_TOKEN — a personal access token with the private scope.";
  }
  return null;
}

/** The fingerprint of what a source said, so an unchanged feed writes nothing. */
export function fingerprintFeed(videos: readonly SourceVideo[]): string {
  return fingerprintLines(
    videos.map((video) => `${video.externalId}\t${video.title}\t${video.description}`),
  );
}

/**
 * ISO 8601 durations, which is what YouTube reports.
 *
 * `PT1H2M10S` is an hour, two minutes and ten seconds. Written out rather than
 * pulled in as a dependency: this is the only place the app meets one, and the
 * grammar it actually needs is four characters wide.
 */
export function parseIsoDuration(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  // "PT" with nothing after it parses, and means nothing.
  return total > 0 ? total : null;
}

async function readJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new FeedError(sourceMessage(detail) ?? `The source refused the request (${response.status}).`);
  }
  return response.json();
}

/** Both APIs answer with a human-readable message; it beats a status code. */
function sourceMessage(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload);
    const message = parsed?.error?.message ?? parsed?.developer_message ?? parsed?.error;
    return typeof message === "string" ? message : null;
  } catch {
    return null;
  }
}

/**
 * A channel's or playlist's most recent videos.
 *
 * Two requests rather than one: the listing gives ids and titles, and the
 * durations come from a second call. Worth it — a duration on the card is the
 * difference between a sermon and a thirty-second trailer.
 */
async function fetchYouTube(kind: VideoFeedKind, externalId: string, limit: number): Promise<SourceVideo[]> {
  const key = youtubeKey();
  if (!key) throw new FeedError(feedUnavailableReason(kind) as string);

  const listing =
    kind === "YOUTUBE_PLAYLIST"
      ? `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${limit}&playlistId=${encodeURIComponent(externalId)}&key=${key}`
      : `https://www.googleapis.com/youtube/v3/search?part=snippet&order=date&type=video&maxResults=${limit}&channelId=${encodeURIComponent(externalId)}&key=${key}`;

  const page = (await readJson(listing)) as { items?: YouTubeItem[] };
  const items = page.items ?? [];

  const ids = items
    .map((item) => item.snippet?.resourceId?.videoId ?? item.id?.videoId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const details = (await readJson(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids.join(",")}&key=${key}`,
  )) as { items?: YouTubeDetail[] };

  return (details.items ?? []).map((item) => ({
    externalId: item.id,
    title: item.snippet?.title ?? "Untitled",
    description: item.snippet?.description ?? "",
    thumbnailUrl: bestThumbnail(item.snippet?.thumbnails),
    publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null,
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
  }));
}

type YouTubeThumbnails = Record<string, { url?: string; width?: number } | undefined>;
type YouTubeItem = { id?: { videoId?: string }; snippet?: { resourceId?: { videoId?: string } } };
type YouTubeDetail = {
  id: string;
  snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: YouTubeThumbnails };
  contentDetails?: { duration?: string };
};

/** The widest one offered, since a card is bigger than a favicon. */
export function bestThumbnail(thumbnails: YouTubeThumbnails | undefined): string | null {
  if (!thumbnails) return null;
  const candidates = Object.values(thumbnails).filter(
    (thumbnail): thumbnail is { url?: string; width?: number } => Boolean(thumbnail?.url),
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url ?? null;
}

async function fetchVimeo(kind: VideoFeedKind, externalId: string, limit: number): Promise<SourceVideo[]> {
  const token = vimeoToken();
  if (!token) throw new FeedError(feedUnavailableReason(kind) as string);

  const path =
    kind === "VIMEO_SHOWCASE"
      ? `/albums/${encodeURIComponent(externalId)}/videos`
      : `/users/${encodeURIComponent(externalId)}/videos`;

  const page = (await readJson(`https://api.vimeo.com${path}?per_page=${limit}&sort=date&direction=desc`, {
    Authorization: `Bearer ${token}`,
  })) as { data?: VimeoVideo[] };

  return (page.data ?? []).map((video) => ({
    // Vimeo's `uri` is "/videos/123456789"; the id is the last segment.
    externalId: (video.uri ?? "").split("/").filter(Boolean).pop() ?? "",
    title: video.name ?? "Untitled",
    description: video.description ?? "",
    thumbnailUrl: video.pictures?.sizes?.slice(-1)[0]?.link ?? null,
    publishedAt: video.release_time ? new Date(video.release_time) : null,
    durationSeconds: typeof video.duration === "number" ? video.duration : null,
  })).filter((video) => video.externalId);
}

type VimeoVideo = {
  uri?: string;
  name?: string;
  description?: string;
  duration?: number;
  release_time?: string;
  pictures?: { sizes?: { link?: string }[] };
};

/** Reads whatever kind of source this feed is. */
export async function fetchFeed(
  kind: VideoFeedKind,
  externalId: string,
  limit: number,
): Promise<FeedResult> {
  const videos = kind.startsWith("YOUTUBE")
    ? await fetchYouTube(kind, externalId, limit)
    : await fetchVimeo(kind, externalId, limit);
  return { videos, fingerprint: fingerprintFeed(videos) };
}

/** Which source a feed kind imports into. */
export function sourceOf(kind: VideoFeedKind): "YOUTUBE" | "VIMEO" {
  return kind.startsWith("YOUTUBE") ? "YOUTUBE" : "VIMEO";
}
