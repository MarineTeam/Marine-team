import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyStreamThumbnailUrl, mapBunnyStreamStatus } from "@/lib/bunny";

const importSchema = z
  .object({
    bunnyVideoId: z.string().min(1),
    title: z.string().min(1),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
    seriesId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
  })
  .refine((body) => !(body.seriesId && body.categoryId), {
    message: "Choose either a series or a category, not both",
  });

/** Attaches an existing Bunny Stream video (uploaded outside the app) to a new DB row. */
export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    const body = importSchema.parse(await request.json());
    if (user.role !== "ADMIN" && !body.seriesId && !body.categoryId) {
      return NextResponse.json({ error: "Choose a series or a category" }, { status: 400 });
    }
    await ensureContentAccess(user, { seriesId: body.seriesId ?? null, categoryId: body.categoryId ?? null });
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
        categoryId: body.categoryId ?? null,
        bunnyVideoId: body.bunnyVideoId,
        bunnyLibraryId: libraryId,
        status: mapBunnyStreamStatus(bunnyVideo.status),
        durationSeconds: bunnyVideo.length ?? null,
        thumbnailUrl: bunnyStreamThumbnailUrl(body.bunnyVideoId),
      },
    });

    await logAudit(user.email, "import", "video", video.id, video.title);
    return NextResponse.json(video, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
