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
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
