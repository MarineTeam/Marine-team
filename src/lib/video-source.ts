import type { VideoSource } from "@prisma/client";
import { bunnyStreamEmbedUrl, bunnyStreamThumbnailUrl } from "@/lib/bunny";

/**
 * Where a video is played from, and how to point at it.
 *
 * A church that already streams its service to YouTube every Sunday has the
 * sermon there before anybody thinks about this app. Re-uploading it costs
 * storage, bandwidth and somebody's Sunday afternoon; pointing at it costs
 * nothing. So a `Video` row is the thing this app knows about a video — its
 * series, its speaker, its scripture references, who may watch it — and
 * `source` decides which player fills the frame.
 *
 * Everything Bunny-only (downloads, captions, MP4 renditions, encode status)
 * is genuinely unavailable for an imported video, which is why `bunnyVideoId`
 * is nullable rather than an empty string: a null is a question the type
 * system makes every caller answer.
 *
 * Server-only, because Bunny's thumbnail and embed URLs are signed and the
 * signing uses `node:crypto`.
 */

export type SourcedVideo = {
  source: VideoSource;
  bunnyVideoId: string | null;
  externalId: string | null;
  externalThumbnailUrl: string | null;
  thumbnailFileName: string | null;
};

/** True when the Bunny-only features apply. */
export function isBunnyVideo(video: Pick<SourcedVideo, "source" | "bunnyVideoId">): boolean {
  return video.source === "BUNNY" && Boolean(video.bunnyVideoId);
}

/**
 * The iframe src.
 *
 * Every player here takes a start time in seconds, which is what lets the
 * chapter list work unchanged across all three.
 */
export function videoEmbedUrl(video: SourcedVideo, startSeconds?: number): string {
  const start = startSeconds && startSeconds > 0 ? Math.floor(startSeconds) : 0;

  if (video.source === "YOUTUBE" && video.externalId) {
    // `youtube-nocookie` and `rel=0`: this is a church's own site, and a
    // sermon should not end in a wall of somebody else's recommendations.
    const query = new URLSearchParams({ rel: "0", modestbranding: "1" });
    if (start > 0) query.set("start", String(start));
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.externalId)}?${query}`;
  }

  if (video.source === "VIMEO" && video.externalId) {
    const query = new URLSearchParams({ dnt: "1" });
    // Vimeo takes the start as a fragment, not a parameter.
    const fragment = start > 0 ? `#t=${start}s` : "";
    return `https://player.vimeo.com/video/${encodeURIComponent(video.externalId)}?${query}${fragment}`;
  }

  return video.bunnyVideoId ? bunnyStreamEmbedUrl(video.bunnyVideoId, start || undefined) : "";
}

/**
 * The still image for a card.
 *
 * An imported video brings its own; Bunny computes one from the file. Either
 * way this returns a string, possibly empty — a card with no image is a
 * layout the app already handles, and a broken one isn't.
 */
export function videoThumbnailUrl(video: SourcedVideo): string {
  if (video.source !== "BUNNY") return video.externalThumbnailUrl ?? "";
  return video.bunnyVideoId ? bunnyStreamThumbnailUrl(video.bunnyVideoId, video.thumbnailFileName) : "";
}

/**
 * Where a viewer would watch it at the source, or null.
 *
 * Worth offering for an imported video: some people would rather watch on
 * YouTube, and a church that wants the view counted there has a reason to
 * make it easy.
 */
export function watchAtSourceUrl(video: Pick<SourcedVideo, "source" | "externalId">): string | null {
  if (!video.externalId) return null;
  if (video.source === "YOUTUBE") return `https://www.youtube.com/watch?v=${encodeURIComponent(video.externalId)}`;
  if (video.source === "VIMEO") return `https://vimeo.com/${encodeURIComponent(video.externalId)}`;
  return null;
}

/** What to call the source on screen. */
export function sourceName(source: VideoSource): string {
  return source === "YOUTUBE" ? "YouTube" : source === "VIMEO" ? "Vimeo" : "this site";
}
