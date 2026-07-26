import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const grant = await prisma.videoViewerGroup.findUniqueOrThrow({
      where: { id },
      include: { video: true, group: true },
    });
    await ensureContentAccess(user, { seriesId: grant.video.seriesId, categoryId: grant.video.categoryId });
    await prisma.videoViewerGroup.delete({ where: { id } });
    await logAudit(user.email, "revoke_video_viewer_group", "video", grant.videoId, grant.group.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
