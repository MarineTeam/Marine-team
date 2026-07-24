import { NextRequest, NextResponse } from "next/server";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { getTargetDb } from "@/lib/admin-target";
import { bunnyStreamThumbnailUrl, mapBunnyStreamStatus } from "@/lib/bunny";

/**
 * Polls Bunny Stream for encoding progress. Bunny status codes: 0 created,
 * 1 uploaded, 2 processing, 3 transcoding, 4 finished, 5 error.
 * https://docs.bunny.net/reference/video_getvideo
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureAdmin();
    const prisma = getTargetDb(request);
    const { id } = await params;
    const video = await prisma.video.findUniqueOrThrow({ where: { id } });

    const res = await fetch(
      `https://video.bunnycdn.com/library/${video.bunnyLibraryId}/videos/${video.bunnyVideoId}`,
      { headers: { AccessKey: process.env.BUNNY_STREAM_API_KEY! } },
    );
    if (!res.ok) {
      throw new Error(`Bunny status check failed: ${res.status}`);
    }
    const data = (await res.json()) as { status: number; length?: number };

    const status = mapBunnyStreamStatus(data.status);
    const updated = await prisma.video.update({
      where: { id },
      data: {
        status,
        durationSeconds: data.length ?? undefined,
        thumbnailUrl: bunnyStreamThumbnailUrl(video.bunnyVideoId),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
