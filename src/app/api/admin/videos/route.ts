import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import {
  ensureStaff,
  ensureSeriesRelatedAccess,
  getEditableScope,
  descendantCategoryIds,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyCreateStreamVideo, bunnyStreamTusSignature } from "@/lib/bunny";

const createSchema = z.object({
  title: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
  seriesId: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    const scope = await getEditableScope(user);
    const where = scope.isAdmin
      ? {}
      : {
          seriesId: {
            in: [
              ...scope.seriesIds,
              ...(await prisma.series.findMany({
                where: { categoryId: { in: await descendantCategoryIds(scope.categoryIds) } },
                select: { id: true },
              })).map((s) => s.id),
            ],
          },
        };
    const videos = await prisma.video.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { series: true },
    });
    return NextResponse.json(videos);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates the DB row + a placeholder in Bunny Stream, then returns TUS upload credentials. */
export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    const body = createSchema.parse(await request.json());
    if (user.role !== "ADMIN" && !body.seriesId) {
      return NextResponse.json({ error: "Choose a series" }, { status: 400 });
    }
    await ensureSeriesRelatedAccess(user, body.seriesId ?? null);

    const bunnyVideoId = await bunnyCreateStreamVideo(body.title);
    const video = await prisma.video.create({
      data: {
        title: body.title,
        slug: body.slug,
        seriesId: body.seriesId ?? null,
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
