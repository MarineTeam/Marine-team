import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  timestampSeconds: z.number().int().min(0).optional(),
  position: z.number().int().min(0).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id }, include: { video: true } });
    await ensureContentAccess(user, { seriesId: chapter.video.seriesId, categoryId: chapter.video.categoryId });

    const data = updateSchema.parse(await request.json());
    const updated = await prisma.chapter.update({ where: { id }, data });
    await logAudit(user.email, "update", "chapter", id, updated.title);
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id }, include: { video: true } });
    await ensureContentAccess(user, { seriesId: chapter.video.seriesId, categoryId: chapter.video.categoryId });

    await prisma.chapter.delete({ where: { id } });
    await logAudit(user.email, "delete", "chapter", id, chapter.title);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
