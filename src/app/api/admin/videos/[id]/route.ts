import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { getTargetDb } from "@/lib/admin-target";
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
  position: z.number().int().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureAdmin();
    const prisma = getTargetDb(request);
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const video = await prisma.video.update({ where: { id }, data: body });
    return NextResponse.json(video);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureAdmin();
    const prisma = getTargetDb(request);
    const { id } = await params;
    const video = await prisma.video.findUniqueOrThrow({ where: { id } });
    await bunnyDeleteStreamVideo(video.bunnyVideoId);
    await prisma.video.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
