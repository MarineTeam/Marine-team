import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { canViewVideo } from "@/lib/content";
import { DENIAL_MESSAGES, getDownloadAvailability } from "@/lib/downloads";
import { resolveMp4Source } from "@/lib/download-source";
import type { ClientPlatform } from "@/lib/download-platform";

/**
 * Hands out a short-lived, signed URL for a video's MP4 so the browser can
 * store it for offline playback.
 *
 * Deliberately not a redirect to the file: the client needs the URL itself to
 * fetch it into the Cache Storage the service worker reads from, and getting
 * a JSON refusal back is what lets the button explain *why* it can't download
 * rather than opening a broken tab.
 *
 * Order of checks matters. Viewing access comes first and is absolute — the
 * download rules can only ever narrow what a member can already watch, never
 * widen it, so a share-link grant or a members-only pass is honoured here by
 * reusing canViewVideo rather than restating it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  try {
    const { videoId } = await params;
    const platform: ClientPlatform = request.nextUrl.searchParams.get("platform") === "pwa" ? "pwa" : "web";

    const [user, video] = await Promise.all([
      getCurrentUser(),
      prisma.video.findFirst({
        where: { id: videoId, published: true, hidden: false, deletedAt: null, status: "READY" },
        select: {
          id: true,
          title: true,
          slug: true,
          memberOnly: true,
          bunnyVideoId: true,
          durationSeconds: true,
          downloadEnabled: true,
          hasMp4Fallback: true,
          mp4Resolutions: true,
          seriesId: true,
          categoryId: true,
          series: { select: { downloadEnabled: true, categoryId: true, title: true } },
        },
      }),
    ]);
    if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!(await canViewVideo(user, video))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const availability = await getDownloadAvailability({ user, video, platform });
    if (!availability.allowed) {
      return NextResponse.json(
        { error: availability.message, reason: availability.reason },
        { status: availability.reason === "not_logged_in" ? 403 : 409 },
      );
    }

    // `getDownloadAvailability` has already refused a video that isn't ours,
    // so by here there is a Bunny id; this narrows the type to match.
    const source = await resolveMp4Source({ ...video, bunnyVideoId: video.bunnyVideoId as string });
    if (!source.ok) {
      return NextResponse.json(
        { error: DENIAL_MESSAGES[source.reason], reason: source.reason },
        // 503 for "our host is having a moment" so a client can sensibly
        // retry; 409 for the states that need a person to change something.
        { status: source.reason === "bunny_error" ? 503 : 409 },
      );
    }

    return NextResponse.json({
      url: source.url,
      // The rendition Bunny actually had, not the one we asked for.
      resolution: `${source.height}p`,
      // Used as the saved file name in the browser-download fallback, and as
      // the cache key's label in the offline list.
      fileName: `${video.slug}-${source.height}p.mp4`,
      title: video.title,
      seriesTitle: video.series?.title ?? null,
      durationSeconds: video.durationSeconds,
      videoSlug: video.slug,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
