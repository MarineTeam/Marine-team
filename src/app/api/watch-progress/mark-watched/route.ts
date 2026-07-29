import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

const schema = z.object({ videoId: z.string().min(1), completed: z.boolean() });

/**
 * Explicit mark/unmark-as-watched, independent of the heartbeat in
 * /api/watch-progress: lets a viewer flip completion directly (e.g. they
 * watched elsewhere, or the heartbeat missed the tail end) without waiting
 * on elapsed-time tracking, and lets them undo a mistaken mark. Setting
 * completed sets positionSeconds to the video's known duration (or leaves
 * it at 0 for an unmark) rather than requiring the caller to know it.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { videoId, completed } = schema.parse(await request.json());
  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { durationSeconds: true } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const positionSeconds = completed ? (video.durationSeconds ?? 0) : 0;
  const progress = await prisma.watchProgress.upsert({
    where: { userId_videoId: { userId: user.id, videoId } },
    create: { userId: user.id, videoId, positionSeconds, completed },
    update: { positionSeconds, completed },
  });
  return NextResponse.json(progress);
}
