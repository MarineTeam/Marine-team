import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({ hidden: z.boolean() });

/** Hides or unhides a comment from public view without deleting it — moderate_comments' "hide", alongside the existing delete. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const { hidden } = updateSchema.parse(await request.json());

    const comment = await prisma.comment.findUniqueOrThrow({
      where: { id },
      include: { series: true, video: { include: { series: true } } },
    });
    const categoryId = comment.series?.categoryId ?? comment.video?.series?.categoryId ?? comment.video?.categoryId ?? null;
    const seriesId = comment.seriesId ?? comment.video?.seriesId ?? undefined;
    await ensureCapability(user, "moderate_comments", { categoryId, seriesId });

    const updated = await prisma.comment.update({ where: { id }, data: { hidden } });
    await logAudit(user.email, hidden ? "hide" : "unhide", "comment", id, comment.body.slice(0, 100));
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
