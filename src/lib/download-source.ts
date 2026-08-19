import { prisma } from "@/lib/db";
import {
  bunnyGetStreamVideo,
  bunnyStreamMp4Url,
  parseBunnyResolutions,
  probeBunnyMp4,
  selectMp4Height,
  type Mp4Height,
} from "@/lib/bunny";
import type { DownloadDenialReason } from "@/lib/downloads";

/**
 * Turns a video into a real, signed MP4 URL — or into the specific reason
 * there isn't one.
 *
 * Bunny's Stream API is the authority here, not the CDN. It reports
 * `hasMP4Fallback` and `availableResolutions` per video, which is the only
 * way to know whether a downloadable rendition exists and at what heights.
 * The previous version guessed 720p and probed the URL, so three unrelated
 * situations — a video encoded only at 480p, a video uploaded before MP4
 * Fallback was switched on, and a pull zone rejecting our token — all
 * surfaced as one unhelpful "no downloadable file yet".
 *
 * The metadata is cached on the Video row (see hasMp4Fallback /
 * mp4Resolutions in schema.prisma) and refreshed by the sync routes, so the
 * member-facing path normally costs one Postgres read. A row that has never
 * been synced is fetched once here and written back; a row that says "no
 * fallback" is *not* re-fetched on every tap, because that would let anyone
 * with a video id drive traffic at Bunny's API. Recovering such a video (after
 * a re-upload or a Bunny repackage) is the sync cron's job, or an admin's
 * "Sync from Bunny" click.
 */
export type Mp4Source =
  | { ok: true; url: string; height: Mp4Height }
  | { ok: false; reason: Extract<DownloadDenialReason, `mp4_${string}` | "resolution_unavailable" | "bunny_error"> };

export type Mp4MetadataInput = {
  id: string;
  bunnyVideoId: string;
  hasMp4Fallback: boolean | null;
  mp4Resolutions: string | null;
};

/**
 * Reads Bunny's MP4 state for a video, fetching and caching it when this row
 * has never been synced. Shared by the download endpoint and the sync routes
 * so there's one definition of what gets stored.
 */
export async function refreshMp4Metadata(
  bunnyVideoId: string,
): Promise<{ hasMp4Fallback: boolean; mp4Resolutions: string | null }> {
  const bunnyVideo = await bunnyGetStreamVideo(bunnyVideoId);
  return {
    hasMp4Fallback: bunnyVideo.hasMP4Fallback === true,
    mp4Resolutions: bunnyVideo.availableResolutions ?? null,
  };
}

export async function resolveMp4Source(video: Mp4MetadataInput): Promise<Mp4Source> {
  let { hasMp4Fallback, mp4Resolutions } = video;

  if (hasMp4Fallback === null) {
    try {
      const fresh = await refreshMp4Metadata(video.bunnyVideoId);
      hasMp4Fallback = fresh.hasMp4Fallback;
      mp4Resolutions = fresh.mp4Resolutions;
      await prisma.video.update({ where: { id: video.id }, data: fresh });
    } catch (error) {
      // Bunny's API being unreachable is our problem, not the member's, and
      // it says nothing about whether the video is downloadable — so it's a
      // "try again", not a "this video has no download".
      console.error("Bunny Stream metadata fetch failed", {
        videoId: video.id,
        error: error instanceof Error ? error.message : "unknown error",
      });
      return { ok: false, reason: "bunny_error" };
    }
  }

  if (!hasMp4Fallback) return { ok: false, reason: "mp4_unavailable" };

  const height = selectMp4Height(mp4Resolutions);
  if (!height) return { ok: false, reason: "resolution_unavailable" };

  let url: string;
  try {
    url = bunnyStreamMp4Url(video.bunnyVideoId, height);
  } catch (error) {
    // Missing CDN hostname — a deployment mistake, so it's logged for us and
    // reported to the member as a temporary failure rather than as their fault.
    console.error("Bunny MP4 URL could not be built", {
      videoId: video.id,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return { ok: false, reason: "bunny_error" };
  }

  const probe = await probeBunnyMp4(url);
  if (probe === "forbidden") {
    // Bunny has the file and refused us: almost always token authentication or
    // the pull zone's allowed-referrers/direct-access settings. Worth logging
    // loudly, because no amount of re-uploading videos will fix it.
    console.error("Bunny refused the MP4 download", { videoId: video.id, height });
    return { ok: false, reason: "mp4_forbidden" };
  }
  if (probe === "missing") {
    // Bunny's API listed the rendition but the CDN doesn't have it — usually
    // a repackage still in flight.
    console.error("Bunny MP4 listed but not served", { videoId: video.id, height, mp4Resolutions });
    return { ok: false, reason: "mp4_missing" };
  }
  // `probe === "error"` deliberately falls through: a network blip on our side
  // is not evidence about the file, and the browser's own fetch may well
  // succeed. Bunny's API already told us the rendition exists.

  return { ok: true, url, height };
}

/** Admin-facing summary of a video's download readiness. No credentials, no URLs. */
export function mp4Diagnostics(video: { hasMp4Fallback: boolean | null; mp4Resolutions: string | null }) {
  return {
    hasMp4Fallback: video.hasMp4Fallback,
    availableResolutions: parseBunnyResolutions(video.mp4Resolutions),
    selectedHeight: video.hasMp4Fallback ? selectMp4Height(video.mp4Resolutions) : null,
  };
}
