import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { bunnyGetStreamVideo, mapBunnyStreamStatus } from "@/lib/bunny";

/**
 * Polls Bunny Stream for encoding progress. Bunny status codes: 0 created,
 * 1 uploaded, 2 processing, 3 transcoding, 4 finished, 5 error.
 * https://docs.bunny.net/reference/video_getvideo
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const video = await prisma.video.findUniqueOrThrow({ where: { id } });
    await ensureContentAccess(user, { seriesId: video.seriesId, categoryId: video.categoryId });

    const data = await bunnyGetStreamVideo(video.bunnyVideoId);

    const status = mapBunnyStreamStatus(data.status);
    const updated = await prisma.video.update({
      where: { id },
      data: {
        status,
        durationSeconds: data.length ?? undefined,
        thumbnailFileName: data.thumbnailFileName ?? null,
        // Refreshed here too, so this button is the manual recovery for a
        // video whose MP4 fallback appeared after the fact — a re-upload or a
        // Bunny repackage. The download endpoint won't re-ask on its own once
        // a video is cached as having no fallback.
        hasMp4Fallback: data.hasMP4Fallback === true,
        mp4Resolutions: data.availableResolutions ?? null,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
