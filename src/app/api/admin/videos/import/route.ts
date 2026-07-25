import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { bunnyStreamThumbnailUrl, mapBunnyStreamStatus } from "@/lib/bunny";

const importSchema = z.object({
  bunnyVideoId: z.string().min(1),
  title: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
  seriesId: z.string().optional().nullable(),
});

/** Attaches an existing Bunny Stream video (uploaded outside the app) to a new DB row. */
export async function POST(request: NextRequest) {
  try {
    await ensureAdmin();
    const body = importSchema.parse(await request.json());
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID!;

    const res = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${body.bunnyVideoId}`,
      { headers: { AccessKey: process.env.BUNNY_STREAM_API_KEY! } },
    );
    if (!res.ok) {
      throw new Error(`Bunny video lookup failed: ${res.status} ${await res.text()}`);
    }
    const bunnyVideo = (await res.json()) as { status: number; length?: number };

    const video = await prisma.video.create({
      data: {
        title: body.title,
        slug: body.slug,
        seriesId: body.seriesId ?? null,
        bunnyVideoId: body.bunnyVideoId,
        bunnyLibraryId: libraryId,
        status: mapBunnyStreamStatus(bunnyVideo.status),
        durationSeconds: bunnyVideo.length ?? null,
        thumbnailUrl: bunnyStreamThumbnailUrl(body.bunnyVideoId),
      },
    });

    return NextResponse.json(video, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
