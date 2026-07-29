import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  timestampSeconds: z.number().int().min(0),
});

/** Lists a video's chapters, in position order. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureStaff();
    const { id } = await params;
    const chapters = await prisma.chapter.findMany({ where: { videoId: id }, orderBy: { position: "asc" } });
    return NextResponse.json(chapters);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Adds a chapter to a video, appended after the current last one. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const video = await prisma.video.findUniqueOrThrow({ where: { id } });
    await ensureContentAccess(user, { seriesId: video.seriesId, categoryId: video.categoryId });

    const { title, timestampSeconds } = createSchema.parse(await request.json());
    const last = await prisma.chapter.findFirst({ where: { videoId: id }, orderBy: { position: "desc" } });
    const chapter = await prisma.chapter.create({
      data: { videoId: id, title, timestampSeconds, position: (last?.position ?? -1) + 1 },
    });
    await logAudit(user.email, "create", "chapter", chapter.id, title);
    return NextResponse.json(chapter, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
