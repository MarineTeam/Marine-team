import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureSeriesRelatedAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({ groupId: z.string().min(1) });

/** Lists this video's granted viewer groups plus every group available to grant. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const video = await prisma.video.findUniqueOrThrow({ where: { id } });
    await ensureSeriesRelatedAccess(user, video.seriesId);
    const [granted, available] = await Promise.all([
      prisma.videoViewerGroup.findMany({ where: { videoId: id }, include: { group: true } }),
      prisma.permissionGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    return NextResponse.json({ granted, available });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Grants a permission group ("role") viewing access to a restricted video. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const video = await prisma.video.findUniqueOrThrow({ where: { id } });
    await ensureSeriesRelatedAccess(user, video.seriesId);
    const { groupId } = schema.parse(await request.json());
    const grant = await prisma.videoViewerGroup.create({
      data: { videoId: id, groupId },
      include: { group: true },
    });
    await logAudit(user.email, "grant_video_viewer_group", "video", id, grant.group.name);
    return NextResponse.json(grant, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
