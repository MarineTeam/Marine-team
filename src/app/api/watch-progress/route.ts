import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

const schema = z.object({
  videoId: z.string().min(1),
  positionSeconds: z.number().int().min(0),
  completed: z.boolean().optional(),
});

/**
 * Heartbeat from the video page: records roughly how far a logged-in user
 * has watched, so the homepage can offer a "Continue watching" row and the
 * video page can resume near where they left off. Bunny Stream's iframe
 * embed doesn't expose a documented postMessage API for exact play/pause/seek
 * events, so this is an elapsed-time approximation, not a precise scrub position.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = schema.parse(await request.json());
  await prisma.watchProgress.upsert({
    where: { userId_videoId: { userId: user.id, videoId: body.videoId } },
    create: {
      userId: user.id,
      videoId: body.videoId,
      positionSeconds: body.positionSeconds,
      completed: body.completed ?? false,
    },
    update: {
      positionSeconds: body.positionSeconds,
      // Only ever sets completed to true here — a heartbeat reporting
      // false (e.g. re-opening a finished video partway through) must not
      // clear a completion that manual "Mark as watched" (or an earlier
      // heartbeat) already recorded. Un-marking is a deliberate action via
      // /api/watch-progress/mark-watched, not an incidental heartbeat.
      completed: body.completed ? true : undefined,
    },
  });
  return NextResponse.json({ ok: true });
}
