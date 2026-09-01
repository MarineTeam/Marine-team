import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import {
  ensureStaff,
  ensureContentAccess,
  getEditableScope,
  descendantCategoryIds,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyCreateStreamVideo, bunnyStreamTusSignature } from "@/lib/bunny";
import { videoThumbnailUrl } from "@/lib/video-source";

const createSchema = z
  .object({
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

export async function GET() {
  try {
    const user = await ensureStaff();
    const scope = await getEditableScope(user);
    let where: Prisma.VideoWhereInput = { deletedAt: null };
    if (!scope.isAdmin) {
      const categoryIds = await descendantCategoryIds(scope.categoryIds);
      where = {
        deletedAt: null,
        OR: [
          {
            seriesId: {
              in: [
                ...scope.seriesIds,
                ...(await prisma.series.findMany({
                  where: { categoryId: { in: categoryIds } },
                  select: { id: true },
                })).map((s) => s.id),
              ],
            },
          },
          { categoryId: { in: categoryIds } },
        ],
      };
    }
    const videos = await prisma.video.findMany({
      where,
      // Reorder writes `position`, so the list has to read it back or the
      // arrows and drag-handle appear to do nothing. createdAt breaks the
      // ties: every row sits at the default 0 until something is moved, and
      // an untouched list should still read newest-first.
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      include: { series: true, category: true, speaker: true },
    });
    // Computed server-side so the admin UI never needs to import bunny.ts
    // (which uses node:crypto and can't be bundled into a client component).
    const withThumbnails = videos.map((v) => ({
      ...v,
      thumbnailPreviewUrl: videoThumbnailUrl(v),
    }));
    return NextResponse.json(withThumbnails);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates the DB row + a placeholder in Bunny Stream, then returns TUS upload credentials. */
export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    const body = createSchema.parse(await request.json());
    if (user.role !== "ADMIN" && !body.seriesId && !body.categoryId) {
      return NextResponse.json({ error: "Choose a series or a category" }, { status: 400 });
    }
    await ensureContentAccess(user, { seriesId: body.seriesId ?? null, categoryId: body.categoryId ?? null });

    const bunnyVideoId = await bunnyCreateStreamVideo(body.title);
    const video = await prisma.video.create({
      data: {
        title: body.title,
        slug: body.slug,
        seriesId: body.seriesId ?? null,
        categoryId: body.categoryId ?? null,
        bunnyVideoId,
        bunnyLibraryId: process.env.BUNNY_STREAM_LIBRARY_ID!,
      },
    });
    await logAudit(user.email, "create", "video", video.id, video.title);

    const upload = bunnyStreamTusSignature(bunnyVideoId);
    return NextResponse.json({ video, upload }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
