import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureSeriesRelatedAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyDeleteStreamVideo } from "@/lib/bunny";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().optional(),
  seriesId: z.string().optional().nullable(),
  memberOnly: z.boolean().optional(),
  published: z.boolean().optional(),
  publishAt: z.string().nullable().optional(),
  unpublishAt: z.string().nullable().optional(),
  position: z.number().int().optional(),
});

function normalizeData(body: z.infer<typeof updateSchema>) {
  return {
    ...body,
    publishAt:
      body.publishAt === undefined ? undefined : body.publishAt === null ? null : new Date(body.publishAt),
    unpublishAt:
      body.unpublishAt === undefined
        ? undefined
        : body.unpublishAt === null
          ? null
          : new Date(body.unpublishAt),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const existing = await prisma.video.findUniqueOrThrow({ where: { id } });
    await ensureSeriesRelatedAccess(user, existing.seriesId);
    const body = updateSchema.parse(await request.json());
    if (body.seriesId !== undefined) await ensureSeriesRelatedAccess(user, body.seriesId);
    const video = await prisma.video.update({ where: { id }, data: normalizeData(body) });
    await logAudit(user.email, "update", "video", video.id, JSON.stringify(body));
    return NextResponse.json(video);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const video = await prisma.video.findUniqueOrThrow({ where: { id } });
    await ensureSeriesRelatedAccess(user, video.seriesId);
    await bunnyDeleteStreamVideo(video.bunnyVideoId);
    await prisma.video.delete({ where: { id } });
    await logAudit(user.email, "delete", "video", id, video.title);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
