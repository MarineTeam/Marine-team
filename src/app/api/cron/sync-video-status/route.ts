import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { bunnyGetStreamVideo, mapBunnyStreamStatus } from "@/lib/bunny";

/**
 * Runs on a schedule (see the "crons" entry in vercel.json) so a video stuck
 * in PROCESSING doesn't require an admin to remember to click "Sync from
 * Bunny" on it — polls Bunny for every non-trashed video still PROCESSING
 * and applies the same status/duration/thumbnail update the manual
 * per-video sync-status route does. Never touches `published`: this only
 * reconciles encoding state, an admin still decides when to publish.
 * Same CRON_SECRET bearer-token guard as notification-digest.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  const stuck = await prisma.video.findMany({ where: { status: "PROCESSING", deletedAt: null } });

  let updated = 0;
  const errors: string[] = [];
  for (const video of stuck) {
    try {
      const data = await bunnyGetStreamVideo(video.bunnyVideoId);
      const status = mapBunnyStreamStatus(data.status);
      if (status !== "PROCESSING") {
        await prisma.video.update({
          where: { id: video.id },
          data: {
            status,
            durationSeconds: data.length ?? undefined,
            thumbnailFileName: data.thumbnailFileName ?? null,
          },
        });
        updated++;
      }
    } catch (err) {
      errors.push(`${video.id}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ checked: stuck.length, updated, errors });
}
