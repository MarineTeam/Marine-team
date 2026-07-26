import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({ userEmail: z.string().email() });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const video = await prisma.video.findUniqueOrThrow({ where: { id } });
    await ensureContentAccess(user, { seriesId: video.seriesId, categoryId: video.categoryId });
    const viewers = await prisma.videoViewer.findMany({ where: { videoId: id }, include: { user: true } });
    return NextResponse.json(viewers);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Grants a specific user viewing access to a restricted video. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const video = await prisma.video.findUniqueOrThrow({ where: { id } });
    await ensureContentAccess(user, { seriesId: video.seriesId, categoryId: video.categoryId });
    const { userEmail } = schema.parse(await request.json());
    const target = await prisma.user.findUnique({ where: { email: userEmail.toLowerCase() } });
    if (!target) {
      return NextResponse.json({ error: "No user with that email has logged in yet" }, { status: 404 });
    }
    const grant = await prisma.videoViewer.create({
      data: { videoId: id, userId: target.id },
      include: { user: true },
    });
    await logAudit(user.email, "grant_video_viewer", "video", id, target.email);
    return NextResponse.json(grant, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
