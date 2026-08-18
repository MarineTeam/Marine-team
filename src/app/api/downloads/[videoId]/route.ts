import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { canViewVideo } from "@/lib/content";
import {
  bunnyGetStreamVideo,
  bunnyStreamMp4Url,
  selectMp4Height,
} from "@/lib/bunny";
import { DENIAL_MESSAGES, getDownloadAvailability } from "@/lib/downloads";
import type { ClientPlatform } from "@/lib/download-platform";

type DownloadErrorReason =
  | "not_logged_in"
  | "not_permitted"
  | "content_blocked"
  | "no_file"
  | "resolution_unavailable"
  | "bunny_error";

function bunnyErrorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;

  const match = error.message.match(
    /Bunny Stream get video failed:\s*(\d{3})/,
  );

  return match ? Number(match[1]) : null;
}

/**
 * Hands out a short-lived, signed URL for a video's MP4 fallback so the
 * browser can download it into Cache Storage for offline playback.
 *
 * Important:
 *
 * - Authorization is checked before talking to Bunny.
 * - Bunny's hasMP4Fallback field is used instead of guessing.
 * - Bunny's availableResolutions field determines which MP4 rendition exists.
 * - We never expose the Bunny API key.
 * - We do not use HEAD as the availability test.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    const { videoId } = await params;

    const platform: ClientPlatform =
      request.nextUrl.searchParams.get("platform") === "pwa"
        ? "pwa"
        : "web";

    if (!videoId || videoId.length > 128) {
      return NextResponse.json(
        {
          error: "Video not found.",
          reason: "video_not_found",
        },
        { status: 404 },
      );
    }

    const [user, video] = await Promise.all([
      getCurrentUser(),
      prisma.video.findFirst({
        where: {
          id: videoId,
          published: true,
          hidden: false,
          deletedAt: null,
          status: "READY",
        },
        select: {
          id: true,
          title: true,
          slug: true,
          memberOnly: true,
          bunnyVideoId: true,
          durationSeconds: true,
          downloadEnabled: true,
          seriesId: true,
          categoryId: true,
          series: { select: { downloadEnabled: true, categoryId: true, title: true } },
        },
      }),
    ]);

    if (!video) {
      return NextResponse.json(
        { error: "Video not found.", reason: "video_not_found" },
        { status: 404 },
      );
    }

    if (!(await canViewVideo(user, video))) {
      return NextResponse.json(
        { error: "Forbidden.", reason: "not_permitted" },
        { status: 403 },
      );
    }

    const availability = await getDownloadAvailability({ user, video, platform });
    if (!availability.allowed) {
      return NextResponse.json(
        { error: availability.message, reason: availability.reason as DownloadErrorReason },
        { status: availability.reason === "not_logged_in" ? 403 : 409 },
      );
    }

    let bunnyVideo: Awaited<ReturnType<typeof bunnyGetStreamVideo>>;
    try {
      bunnyVideo = await bunnyGetStreamVideo(video.bunnyVideoId);
    } catch (error) {
      const status = bunnyErrorStatus(error);
      if (status === 404) {
        return NextResponse.json(
          { error: DENIAL_MESSAGES.no_file, reason: "no_file" as DownloadErrorReason },
          { status: 409 },
        );
      }
      throw error;
    }

    if (!bunnyVideo.hasMP4Fallback) {
      return NextResponse.json(
        { error: DENIAL_MESSAGES.no_file, reason: "no_file" as DownloadErrorReason },
        { status: 409 },
      );
    }

    const selectedHeight = selectMp4Height(bunnyVideo.availableResolutions);
    if (!selectedHeight) {
      return NextResponse.json(
        {
          error: DENIAL_MESSAGES.no_file,
          reason: "resolution_unavailable" as DownloadErrorReason,
        },
        { status: 409 },
      );
    }

    const url = bunnyStreamMp4Url(video.bunnyVideoId, selectedHeight);

    return NextResponse.json({
      url,
      fileName: `${video.slug}-${selectedHeight}p.mp4`,
      title: video.title,
      seriesTitle: video.series?.title ?? null,
      durationSeconds: video.durationSeconds,
      videoSlug: video.slug,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
