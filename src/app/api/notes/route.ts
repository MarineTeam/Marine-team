import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { getSermonNotes } from "@/lib/content";

const querySchema = z.object({ videoId: z.string().min(1) });
const postSchema = z.object({
  videoId: z.string().min(1),
  timestampSeconds: z.number().int().min(0),
  body: z.string().trim().min(1).max(2000),
});

/** A member's own notes on a video — private, so this never accepts another user's id. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const { videoId } = querySchema.parse({ videoId: searchParams.get("videoId") });
  return NextResponse.json(await getSermonNotes(user.id, videoId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { videoId, timestampSeconds, body } = postSchema.parse(await request.json());

  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { categoryId: true, seriesId: true } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const categoryId = video.categoryId ?? (
    video.seriesId
      ? (await prisma.series.findUnique({ where: { id: video.seriesId }, select: { categoryId: true } }))?.categoryId ?? null
      : null
  );
  if (!(await isPluginEnabled("sermon-notes", categoryId))) {
    return NextResponse.json({ error: "Sermon notes are disabled here" }, { status: 403 });
  }

  const note = await prisma.sermonNote.create({
    data: { userId: user.id, videoId, timestampSeconds, body },
  });
  return NextResponse.json(note, { status: 201 });
}
